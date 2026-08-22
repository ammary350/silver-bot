/**
 * Message updates — anti-delete detection.
 */

const handler = require('../handlers');

function registerMessagesUpdateEvents(sock, ctx) {
  sock.ev.on('messages.update', (updates) => {
    handler.handleMessageUpdate(sock, updates).catch(() => {});
  });
}

module.exports = { registerMessagesUpdateEvents };
