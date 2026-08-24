/**
 * Group participant updates — welcome/goodbye + live ban enforcement.
 */

const handler = require('../handlers');
const { handleParticipantAdd } = require('../features/bans/enforcer');
const { handleParticipantUpdate } = require('../features/linkhub');

function registerGroupParticipantsEvents(sock, ctx) {
  sock.ev.on('group-participants.update', async (update) => {
    try {
      await handler.handleGroupUpdate(sock, update);
      await handleParticipantAdd(sock, update);
      await handleParticipantUpdate(sock, update);
    } catch (error) {
      console.error('[events] group participant update failed:', error.message);
    }
  });
}

module.exports = { registerGroupParticipantsEvents };
