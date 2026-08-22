/**
 * WhatsApp socket bootstrap — separated from pairing/session/events.
 */

const { default: makeWASocket, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { createSuppressedLogger } = require('../core/logger');

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 60000;

function getReconnectDelay() {
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
  const jitter = Math.random() * 2000;
  return delay + jitter;
}

function resetReconnectAttempts() {
  reconnectAttempts = 0;
}

function getReconnectAttempts() {
  return reconnectAttempts;
}

async function safeFetchVersion(timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetchLatestBaileysVersion({ signal: controller.signal });
    return result;
  } catch (e) {
    console.warn('[version] Could not fetch latest WA version, using default');
    return { version: [2, 3000, 1016694426] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create a new WhatsApp socket. `auth` may be null on first fresh run.
 */
async function createSocket({ auth }) {
  const { version } = await safeFetchVersion();
  const suppressedLogger = createSuppressedLogger('silent');

  const sock = makeWASocket({
    version,
    logger: suppressedLogger,
    printQRInTerminal: false,
    browser: ['Chrome', 'Windows', '10.0'],
    auth,
    syncFullHistory: false,
    downloadHistory: false,
    markOnlineOnConnect: false,
    getMessage: async () => undefined
  });

  return sock;
}

module.exports = { createSocket, getReconnectDelay, resetReconnectAttempts, getReconnectAttempts };
