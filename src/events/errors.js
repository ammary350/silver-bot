/**
 * Socket error events.
 */

const { DisconnectReason } = require('@whiskeysockets/baileys');

function registerErrorEvents(sock, ctx) {
  sock.ev.on('error', (error) => {
    const statusCode = error?.output?.statusCode;
    if (statusCode === DisconnectReason.connectionReplaced || statusCode === 503 || statusCode === DisconnectReason.connectionLost) return;
    console.error('[socket] Error:', error.message || error);
  });
}

module.exports = { registerErrorEvents };
