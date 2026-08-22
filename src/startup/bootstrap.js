/**
 * Startup bootstrap — deterministic headless-friendly startup for VPS.
 * Responsibilities:
 *  - resolve startup mode (auto-restore / pairing / interactive menu)
 *  - create the socket (services/waSocket.js) and wire events (events/)
 *  - handle reconnect/relink flows
 *  - graceful shutdown + process-level error recovery
 *  - public exports: store, requestPairingCode, gracefulShutdown
 */

require('dotenv').config();

const { initializeTempSystem } = require('../utils/tempManager');
const { startCleanup, cleanupOldFiles } = require('../utils/cleanup');
const { installConsoleSuppression } = require('../core/logger');

initializeTempSystem();
startCleanup();
installConsoleSuppression();

const fs = require('fs');
const config = require('../config');
const database = require('../storage/database');
const session = require('../storage/session');
const { store } = require('../core/store');
const { createSocket, resetReconnectAttempts } = require('../services/waSocket');
const { registerEvents } = require('../events');
const pairing = require('../features/pairing/pairing');
const interactive = require('./interactive');

let activeSocket = null;
let saveCredsRef = null;
let isShuttingDown = false;
let isConnecting = false;

// ── Startup mode: auto-start by default, interactive only on first run ──
async function resolveStartupMode() {
  const sessionFolder = session.getSessionFolder();
  const validation = session.validateSession(sessionFolder);

  const firstRun = !fs.existsSync(sessionFolder) || session.listSessionFiles(sessionFolder).length === 0;

  // Explicit opt-in only: PAIRING_NUMBER env is set and there is no valid session
  if (process.env.PAIRING_NUMBER && !validation.valid) {
    console.log(`[session] ✗ Session invalid: ${validation.reason || 'no valid session'}`);
    console.log('[session]   Using PAIRING_NUMBER for headless pairing (explicit opt-in)');
    return 'pair';
  }

  // FORCE_MENU=1 — show the interactive menu (manual choice, pairing options)
  if (process.env.FORCE_MENU === '1' || process.env.FORCE_MENU?.toLowerCase() === 'true') {
    return await interactive.showInteractiveMenu(validation, sessionFolder);
  }

  // Default: auto-start with saved session (silent reconnect, no QR)
  if (validation.valid) {
    console.log(`[session] ✓ Session restored — ${validation.fileCount} auth files loaded`);
    const meDigits = String(validation.me?.id || '').replace(/[^0-9]/g, '');
    console.log(`[session]   Registered as: ***${meDigits.slice(-3)}`);
    return 'normal';
  }

  // Default QR flow: no valid session — connect fresh and show QR in the terminal
  if (firstRun) {
    console.log('[startup] No existing session found — showing QR for first login');
  } else {
    console.log(`[session] ✗ Session invalid: ${validation.reason}`);
    console.log('[session]   Starting fresh — a new QR will be shown for login');
  }
  return 'qr';
}

async function closeActiveSocket() {
  if (activeSocket) {
    try {
      activeSocket.removeAllListeners('connection.update');
      activeSocket.removeAllListeners('creds.update');
      activeSocket.removeAllListeners('messages.upsert');
      activeSocket.removeAllListeners('group-participants.update');
      activeSocket.removeAllListeners('error');
      activeSocket.removeAllListeners('message-receipt.update');
      activeSocket.removeAllListeners('messages.update');
      activeSocket.ev.removeAllListeners('connection.update');
      activeSocket.ev.removeAllListeners('creds.update');
      activeSocket.ev.removeAllListeners('messages.upsert');
      activeSocket.ev.removeAllListeners('group-participants.update');
      activeSocket.ev.removeAllListeners('error');
      activeSocket.ev.removeAllListeners('message-receipt.update');
      activeSocket.ev.removeAllListeners('messages.update');
      await activeSocket.end(undefined);
      activeSocket.ws?.close();
    } catch (e) {
      // Silently handle — socket may already be dead
    }
    activeSocket = null;
  }
}

async function startBot(mode = 'normal') {
  if (isConnecting) {
    console.log('[startup] Already connecting, skipping duplicate call');
    return;
  }
  isConnecting = true;
  try {
    const sessionFolder = session.getSessionFolder();

    if (mode === 'relink') {
      console.log('[startup] Clearing session for fresh re-link...');
      session.clearStaleSession(sessionFolder);
      console.log('[startup] Session cleared. A fresh QR will be shown for login.');
      mode = 'qr';
    }

    if (mode === 'pair') {
      const number = await interactive.getPairingNumber();
      global._pendingPairNumber = number;
      console.log(`[startup] Will request pairing code for ***${String(number).slice(-3)} after connection...`);
    } else {
      global._pendingPairNumber = null;
    }

    // Handle KnightBot! session format
    session.importSessionString(sessionFolder);

    // Invalid-but-present session files (corrupt/incomplete) would make Baileys
    // attempt a doomed registration and end in loggedOut — clear them for a clean flow.
    const validation = session.validateSession(sessionFolder);
    if (!validation.valid && session.listSessionFiles(sessionFolder).length > 0) {
      console.log(`[auth] Existing session is invalid (${validation.reason}). Clearing for a clean login...`);
      session.clearStaleSession(sessionFolder);
    }

    // Close any existing socket before creating new one
    await closeActiveSocket();

    // Handle KnightBot! session format
    session.importSessionString(sessionFolder);

    console.log('[auth] Loading auth state from:', sessionFolder);
    const auth = await session.loadAuthState(sessionFolder);
    saveCredsRef = auth.saveCreds;

    const sock = await createSocket({ auth: auth.state });

    activeSocket = sock;
    resetReconnectAttempts();

    store.bind(sock.ev);

    registerEvents(sock, {
      store,
      saveCreds: auth.saveCreds,
      sessionFolder,
      getActiveSocket: () => activeSocket,
      getIsShuttingDown: () => isShuttingDown,
      startBot: () => startBot(),
      stop: () => { isShuttingDown = true; },
      touchActivity: () => {}
    });

    return sock;
  } finally {
    isConnecting = false;
  }
}

// ── Public API for pairing command ──
async function requestPairingCode(phoneNumber) {
  if (!activeSocket) {
    throw new Error('Bot not started yet. Socket not available.');
  }
  const result = await pairing.requestPairingCode(activeSocket, phoneNumber);
  return result.code;
}

// ── Start ──
async function main() {
  console.log('\nStarting WhatsApp MD Bot...\n');
  console.log(`  Name:   ${config.botName}`);
  console.log(`  Prefix: ${config.prefix}`);
  console.log(`  Session: ${config.sessionName || 'session'}\n`);

  const mode = await resolveStartupMode();
  console.log(`[startup] Mode: ${mode}`);
  startBot(mode).catch(err => {
    console.error('[startup] Error starting bot:', err);
    process.exit(1);
  });
}

if (require.main === module) {
  main();
}

// ── Process handlers ──
process.on('uncaughtException', (err) => {
  if (err.code === 'ENOSPC' || err.errno === -28 || err.message?.includes('no space left on device')) {
    console.error('[system] No space left on device. Attempting cleanup...');
    cleanupOldFiles();
    return;
  }
  const fatal = [
    'listen EADDRINUSE', 'EACCES', 'ENOENT', 'MODULE_NOT_FOUND',
    'SyntaxError', 'ReferenceError', 'TypeError'
  ];
  if (!fatal.some(f => err.message?.includes(f))) {
    console.error('[system] Recoverable error, attempting restart:', err.message);
    setTimeout(() => startBot().catch(e => {
      console.error('[system] Fatal restart failure:', e.message);
      process.exit(1);
    }), 3000);
    return;
  }
  console.error('[system] Fatal uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  if (err.code === 'ENOSPC' || err.errno === -28 || err.message?.includes('no space left on device')) {
    console.warn('[system] No space in promise. Attempting cleanup...');
    cleanupOldFiles();
    return;
  }
  if (err.message && (err.message.includes('rate-overlimit') || err.message.includes('not-authorized'))) {
    return;
  }
  const recoverable = ['Connection Closed', 'stream error', 'socket hang up', 'ECONNRESET', 'ETIMEDOUT'];
  if (recoverable.some(r => err.message?.includes(r))) {
    console.warn('[system] Recoverable rejection:', err.message);
    return;
  }
  console.error('[system] Unhandled Rejection:', err);
});

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[system] Received ${signal}. Shutting down gracefully...`);

  if (activeSocket) {
    try {
      if (saveCredsRef) {
        try {
          await saveCredsRef();
          console.log('[creds] Final credentials flush complete');
        } catch (e) {
          console.warn('[creds] Final credentials flush failed:', e.message);
        }
        saveCredsRef = null;
      }
      activeSocket.removeAllListeners();
      activeSocket.ev.removeAllListeners();
      await activeSocket.end(undefined);
      activeSocket.ws?.close();
      console.log('[socket] Baileys socket closed');
    } catch (e) {
      console.warn('[socket] Error closing socket:', e.message);
    }
    activeSocket = null;
  }

  console.log('[system] Goodbye.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { store, requestPairingCode, gracefulShutdown, startBot, main };
