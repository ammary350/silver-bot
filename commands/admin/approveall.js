const database = require('../../database');
const perm = require('../../lib/permissions');

module.exports = {
  name: 'approveall',
  aliases: ['acceptall', 'approve'],
  category: 'admin',
  description: 'Approve all pending join requests (blocked numbers are skipped)',
  usage: '.approveall',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const groupId = extra.from;
      let requests;
      try {
        requests = await sock.groupRequestParticipantsList(groupId);
      } catch (e) {
        return extra.reply('❌ Cannot list join requests. The bot may not be an admin or this group does not support join requests.');
      }
      if (!requests || requests.length === 0) {
        return extra.reply('📋 No pending join requests to approve.');
      }
      const approved = [];
      const blocked = [];
      const failed = [];
      for (const r of requests) {
        const jid = r.jid || r.participant;
        if (!jid) { failed.push('unknown'); continue; }
        const normalized = database.normalizeNumber(jid);
        if (database.isNumberBlocked(normalized)) {
          if (perm.isOwner(jid)) {
            approved.push(jid);
            continue;
          }
          blocked.push(jid);
          continue;
        }
        try {
          await sock.groupRequestParticipantsUpdate(groupId, [jid], 'approve');
          approved.push(jid);
        } catch (e) {
          failed.push(jid);
        }
      }
      let text = '';
      if (approved.length > 0) {
        text += `✅ *Approved: ${approved.length}*\n`;
        const approvalMsg = database.getApprovalMessage(groupId) || 'Welcome to the group! Please read the rules and enjoy your stay.';
        try {
          await sock.sendMessage(groupId, {
            text: `👋 ${approvalMsg}`,
            mentions: approved
          });
        } catch (e) {}
      }
      if (blocked.length > 0) {
        text += `🚫 *Blocked (skipped): ${blocked.length}*\n`;
      }
      if (failed.length > 0) {
        text += `❌ *Failed: ${failed.length}*\n`;
      }
      if (!text) text = '✅ All pending requests processed.';
      await extra.reply(text.trim());
    } catch (e) {
      console.error('[approveall error]', e.message);
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
