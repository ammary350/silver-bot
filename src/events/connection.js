/**
 * Connection lifecycle events — qr/pairing, open, close/reconnect, watchdog.
 * Separated from socket bootstrap (services/waSocket.js) and startup input (startup/).
 */

const config = require('../config');
const database = require('../storage/database');
const session = require('../storage/session');
const QRCode = require('qrcode');
const { getReconnectDelay, resetReconnectAttempts, getReconnectAttempts } = require('../services/waSocket');
const pairing = require('../features/pairing/pairing');
const { enforceAllBans } = require('../features/bans/enforcer');
const handler = require('../handlers');
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

process.on('uncaughtException', (error) => {
  console.error('[system] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('[system] Unhandled rejection:', error);
  process.exit(1);
});

const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

/**
 * Print a QR code to the terminal for first-time login.
 * Baileys rc.9 deprecated printQRInTerminal, so we render it ourselves
 * with the installed `qrcode` package (already used by the qr command).
 */
async function printQrToTerminal(qr) {
  console.log('\n[qr] ═══════════════════════════════════════════════');
  console.log('[qr] Scan the QR code below with your phone:');
  console.log('[qr]   WhatsApp > Linked Devices > Link a Device');
  console.log('[qr] The QR refreshes automatically if it expires.');
  console.log('[qr] ═══════════════════════════════════════════════');
  try {
    const ascii = await QRCode.toString(qr, { type: 'terminal', small: true });
    console.log(ascii);
  } catch (e) {
    console.log('[qr] Could not render QR to terminal — scanning raw data instead.');
    console.log(qr);
  }
  console.log('[qr] ═══════════════════════════════════════════════\n');
}

function getDisconnectReasonName(statusCode) {
  const map = {
    [DisconnectReason.connectionClosed]: 'connectionClosed',
    [DisconnectReason.connectionLost]: 'connectionLost',
    [DisconnectReason.connectionReplaced]: 'connectionReplaced',
    [DisconnectReason.loggedOut]: 'loggedOut',
    [DisconnectReason.badSession]: 'badSession',
    [DisconnectReason.restartRequired]: 'restartRequired',
    [DisconnectReason.timedOut]: 'timedOut'
  };
  return map[statusCode] || `unknown(${statusCode})`;
}

/**
 * @param {object} sock
 * @param {object} ctx  { getIsShuttingDown, startBot, sessionFolder, store, touchActivity }
 */
function registerConnectionEvents(sock, ctx) {
  let watchdogInterval = null;
  let lastActivity = Date.now();
  let enforcementStarted = false;

  const startWatchdog = () => {
    if (watchdogInterval) clearInterval(watchdogInterval);
    watchdogInterval = setInterval(() => {
      if (ctx.getActiveSocket() !== sock) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
        return;
      }
      if (Date.now() - lastActivity > INACTIVITY_TIMEOUT && sock.ws?.readyState === 1) {
        console.log('[watchdog] No activity detected. Closing socket for reconnect...');
        clearInterval(watchdogInterval);
        watchdogInterval = null;
        sock.end(undefined);
        // The connection 'close' handler will manage the reconnect
      }
    }, 5 * 60 * 1000);
  };

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ── QR / pairing code ──
    if (qr) {
      const pairNumber = global._pendingPairNumber;
      if (pairNumber) {
        global._pendingPairNumber = null;
        console.log(`\n[pairing] Requesting pairing code for ${pairNumber}...\n`);
        const result = await pairing.tryRequestPairing(sock, pairNumber);
        if (!result.ok) {
          // Restore the pending number so a later QR event retries
          global._pendingPairNumber = pairNumber;
          console.log('[pairing] Will retry on the next QR signal.');
        }
      } else {
        await printQrToTerminal(qr);
      }
    }

    // ── Connected ──
    if (connection === 'open') {
      lastActivity = Date.now();
      resetReconnectAttempts();
      startWatchdog();
      console.log('\n[connection] Bot connected successfully!');
      console.log(`[connection] Bot Number: ${sock.user?.id?.split(':')[0] || 'unknown'}`);
      console.log(`[connection] Bot Name: ${config.botName}`);
      console.log(`[connection] Prefix: ${config.prefix}`);
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
      console.log(`[connection] Owner: ${ownerNames}\n`);
      console.log('[connection] Bot is ready to receive messages!\n');

      if (config.autoBio) {
        try { await sock.updateProfileStatus(`${config.botName} | Active 24/7`); } catch (e) {}
      }

      const connectedNumber = sock.user?.id?.split(':')[0] || '';
      if (connectedNumber) database.setBotNumber(connectedNumber);

      handler.initializeAntiCall(sock);

      const now = Date.now();
      for (const [jid, chatMsgs] of ctx.store.messages.entries()) {
        const timestamps = Array.from(chatMsgs.values()).map(m => (m.messageTimestamp || 0) * 1000);
        if (timestamps.length > 0 && now - Math.max(...timestamps) > 24 * 60 * 60 * 1000) {
          ctx.store.messages.delete(jid);
        }
      }
      console.log(`[connection] Store cleaned. Active chats: ${ctx.store.messages.size}`);

      // ── Contact-ban enforcement: scan all groups once after connect ──
      if (!enforcementStarted) {
        enforcementStarted = true;
        setTimeout(() => {
          enforceAllBans(sock, {}).catch(e => {
            console.error('[bans] Startup enforcement error:', e.message);
          });
        }, 5000);
      }
    }

    // ── Disconnected ──
    if (connection === 'close') {
      if (ctx.getIsShuttingDown()) {
        console.log('[disconnect] Shutdown in progress, not reconnecting');
        return;
      }

      if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
      }

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || '';
      const reasonName = getDisconnectReasonName(statusCode);

      console.log(`[disconnect] Connection closed. Reason: ${reasonName}`);
      if (errorMessage && !errorMessage.includes('rate-overlimit')) console.log(`[disconnect] Error: ${errorMessage}`);

      const shouldReconnect = !(lastDisconnect?.error instanceof Boom &&
        lastDisconnect.error.output.statusCode === DisconnectReason.loggedOut);
      if (!shouldReconnect) {
        console.log('[disconnect] Fatal disconnect reason. Exiting for process manager restart.');
        process.exit(1);
      }

      // ── Logged out permanently — fresh login required ──
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('\n[relink] ⛔ Bot was logged out from WhatsApp. Session is no longer valid.');
        console.log('[relink]    Clearing stale session...');
        session.clearStaleSession(ctx.sessionFolder);
        resetReconnectAttempts();
        console.log('[relink]    Fresh login required — a new QR will appear shortly. Scan it with WhatsApp > Linked Devices > Link a Device.\n');
        setTimeout(() => ctx.startBot(), 3000);
        return;
      }

      // ── Bad session — clear and fall back to fresh auth ──
      if (statusCode === DisconnectReason.badSession || errorMessage.includes('not-authorized')) {
        console.log('[relink] ⚠️ Bad session detected. Auth data may be corrupted.');
        console.log('[relink]    Clearing stale session...');
        session.clearStaleSession(ctx.sessionFolder);
        resetReconnectAttempts();
        console.log('[relink]    Will retry with fresh auth shortly.\n');
        setTimeout(() => ctx.startBot(), 3000);
        return;
      }

      // ── Restart required — reconnect immediately ──
      if (statusCode === DisconnectReason.restartRequired) {
        console.log('[reconnect] ↻ Restart required. Reconnecting immediately...');
        resetReconnectAttempts();
        setTimeout(() => ctx.startBot(), 1000);
        return;
      }

      // ── Recoverable disconnects: connection closed, lost, timed out, replaced ──
      const delay = getReconnectDelay();
      console.log(`[reconnect] ↻ Disconnected (${reasonName}). Reconnecting in ${Math.round(delay / 1000)}s (attempt #${getReconnectAttempts()})`);
      setTimeout(() => ctx.startBot(), delay);
    }
  });

  return {
    touch: () => { lastActivity = Date.now(); },
    stopWatchdog: () => {
      if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
      }
    }
  };
}

module.exports = { registerConnectionEvents };
