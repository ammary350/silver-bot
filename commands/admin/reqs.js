const database = require('../../database');

module.exports = {
  name: 'reqs',
  aliases: ['joinrequests', 'pending'],
  category: 'admin',
  description: 'Show pending join requests for this group',
  usage: '.reqs',
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
        return extra.reply('📋 No pending join requests for this group.');
      }
      let text = `📋 *Pending Join Requests: ${requests.length}*\n\n`;
      for (let i = 0; i < requests.length; i++) {
        const r = requests[i];
        const jid = r.jid || r.participant || 'unknown';
        const num = jid.split('@')[0];
        const method = r.request_method || 'unknown';
        const time = r.request_time ? new Date(r.request_time * 1000).toLocaleString() : 'unknown';
        text += `${i + 1}. @${num}\n   Method: ${method}\n   Time: ${time}\n\n`;
      }
      const mentions = requests.map(r => r.jid || r.participant).filter(Boolean);
      await sock.sendMessage(groupId, { text, mentions }, { quoted: msg });
    } catch (e) {
      console.error('[reqs error]', e.message);
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
