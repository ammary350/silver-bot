const database = require('../../database');
const perm = require('../../lib/permissions');

module.exports = {
  name: 'scan',
  aliases: ['scangroup'],
  category: 'protection',
  description: 'Scan current group for blocked numbers and remove them',
  usage: '.scan',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const groupId = extra.from;
      const groupMetadata = extra.groupMetadata;
      if (!groupMetadata || !groupMetadata.participants) {
        return extra.reply('❌ Could not fetch group participants.');
      }
      const botIsAdmin = extra.isBotAdmin;
      let found = [];
      for (const p of groupMetadata.participants) {
        const pJid = p.id || p.jid || p.participant || '';
        if (perm.isOwner(pJid)) continue;
        const normalized = database.normalizeNumber(pJid);
        if (database.isNumberBlocked(normalized)) {
          found.push({ jid: pJid });
        }
      }
      if (found.length === 0) {
        return extra.reply('✅ No blocked numbers found in this group.');
      }
      let text = `🚫 *Blocked Numbers Found: ${found.length}*\n\n`;
      const removed = [];
      const failed = [];
      for (const f of found) {
        const num = f.jid.split('@')[0];
        text += `• @${num}\n\n`;
        if (botIsAdmin) {
          try {
            await sock.groupParticipantsUpdate(groupId, [f.jid], 'remove');
            removed.push(f.jid);
          } catch (e) {
            failed.push(f.jid);
          }
        }
      }
      if (botIsAdmin) {
        text += `---\n✅ Removed: ${removed.length}`;
        if (failed.length > 0) text += `\n❌ Failed: ${failed.length}`;
      } else {
        text += '⚠️ Bot is not an admin — cannot remove.';
      }
      const mentions = found.map(f => f.jid);
      await sock.sendMessage(groupId, { text, mentions }, { quoted: msg });
    } catch (e) {
      console.error('[scan error]', e.message);
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
