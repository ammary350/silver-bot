/**
 * Events index — wires every socket event with the shared context.
 *
 * ctx = {
 *   store,                 // in-memory message store (src/core/store.js)
 *   saveCreds,             // Baileys auth saver (may be null on fresh runs)
 *   sessionFolder,         // resolved session folder
 *   getActiveSocket,       // () => current socket (watchdog identity check)
 *   getIsShuttingDown,     // () => boolean
 *   startBot,              // () => recreate the socket (reconnect/relink)
 *   stop,                  // () => mark shutdown (permanent logout)
 *   touchActivity          // () => reset the inactivity watchdog
 * }
 */

const { registerConnectionEvents } = require('./connection');
const { registerCredsEvents } = require('./creds');
const { registerMessagesEvents } = require('./messages');
const { registerGroupParticipantsEvents } = require('./groupParticipants');
const { registerMessagesUpdateEvents } = require('./messagesUpdate');
const { registerErrorEvents } = require('./errors');

function registerEvents(sock, ctx) {
  const connection = registerConnectionEvents(sock, ctx);
  // Message activity resets the watchdog clock (true inactivity detection)
  ctx.touchActivity = connection.touch;
  registerCredsEvents(sock, ctx);
  registerMessagesEvents(sock, ctx);
  registerGroupParticipantsEvents(sock, ctx);
  registerMessagesUpdateEvents(sock, ctx);
  registerErrorEvents(sock, ctx);
  return connection;
}

module.exports = { registerEvents };
