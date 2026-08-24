/**
 * Incoming messages — dedupe, age filter, store, dispatch to handler.
 */

const config = require('../config');
const handler = require('../handlers');

const processedMessages = new Set();
setInterval(() => {
  processedMessages.clear();
}, 5 * 60 * 1000);

function registerMessagesEvents(sock, ctx) {
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    try {
      if (type !== 'notify' || !Array.isArray(messages)) return;

      for (const msg of messages) {
        try {
      if (!msg.message || !msg.key?.id) continue;

      const from = msg.key.remoteJid;
      if (!from) continue;

      if (from.includes('@broadcast') || from.includes('status.broadcast') ||
          from.includes('@newsletter') || from.includes('@newsletter.')) continue;

      const msgId = msg.key.id;
      if (processedMessages.has(msgId)) continue;

      const MESSAGE_AGE_LIMIT = 5 * 60 * 1000;
      let messageAge = 0;
      if (msg.messageTimestamp) {
        messageAge = Date.now() - (msg.messageTimestamp * 1000);
        if (messageAge > MESSAGE_AGE_LIMIT) continue;
      }

      processedMessages.add(msgId);

      if (msg.key && msg.key.id) {
        if (!ctx.store.messages.has(from)) {
          ctx.store.messages.set(from, new Map());
          while (ctx.store.messages.size > (ctx.store.maxChats || 500)) {
            ctx.store.messages.delete(ctx.store.messages.keys().next().value);
          }
        }
        const chatMsgs = ctx.store.messages.get(from);
        chatMsgs.set(msg.key.id, msg);
        if (chatMsgs.size > ctx.store.maxPerChat) {
          const sortedIds = Array.from(chatMsgs.entries())
            .sort((a, b) => (a[1].messageTimestamp || 0) - (b[1].messageTimestamp || 0))
            .map(([id]) => id);
          for (let i = 0; i < sortedIds.length - ctx.store.maxPerChat; i++) {
            chatMsgs.delete(sortedIds[i]);
          }
        }
      }

      ctx.touchActivity();

      handler.handleMessage(sock, msg).catch(err => {
        if (!err.message?.includes('rate-overlimit') && !err.message?.includes('not-authorized')) {
          console.error('[handler] Error handling message:', err.message);
        }
      });

      setImmediate(async () => {
        if (config.autoRead && from.endsWith('@g.us')) {
          try { await sock.readMessages([msg.key]); } catch (e) {}
        }
        if (from.endsWith('@g.us')) {
          try {
            const groupMetadata = await handler.getGroupMetadata(sock, msg.key.remoteJid);
            if (groupMetadata) await handler.handleAntilink(sock, msg, groupMetadata);
          } catch (error) {}
        }
      });
        } catch (error) {
          console.error('[events] message dispatch failed:', error.message);
        }
      }
    } catch (error) {
      console.error('[events] messages.upsert failed:', error.message);
    }
  });

  sock.ev.on('message-receipt.update', () => {});
}

module.exports = { registerMessagesEvents };
