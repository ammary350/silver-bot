/**
 * Anti-call feature — rejects and blocks incoming calls.
 */

const config = require('../config');
const perm = require('../core/permissions');

const initializeAntiCall = (sock) => {
  sock.ev.on('call', async (calls) => {
    try {
      if (!config.defaultGroupSettings.anticall) return;

      for (const call of calls) {
        if (call.status === 'offer') {
          await sock.rejectCall(call.id, call.from);

          if (perm.isOwner(call.from)) {
            continue;
          }

          await sock.updateBlockStatus(call.from, 'block');

          await sock.sendMessage(call.from, {
            text: '🚫 Calls are not allowed. You have been blocked.'
          });
        }
      }
    } catch (err) {
      console.error('[ANTICALL ERROR]', err);
    }
  });
};

module.exports = { initializeAntiCall };
