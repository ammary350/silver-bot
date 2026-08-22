const perm = require('../../lib/permissions');

module.exports = {
  name: 'panic',
  aliases: ['emergency'],
  category: 'protection',
  description: 'Emergency group lockdown (owner/co-owner only)',
  usage: '.panic',
  groupOnly: true,
  coOwnerOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const groupId = extra.from;
      const groupMetadata = extra.groupMetadata;

      await sock.groupSettingUpdate(groupId, 'announcement');

      if (groupMetadata && groupMetadata.participants) {
        const botJid = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
        const demoted = [];
        const skipped = [];

        for (const p of groupMetadata.participants) {
          if (p.admin !== 'admin' && p.admin !== 'superadmin') continue;
          const pJid = p.id || p.jid || p.participant || '';
          if (!pJid) continue;

          if (perm.isOwner(pJid) || perm.isCoOwner(pJid) || pJid === botJid) {
            skipped.push(pJid);
            continue;
          }

          try {
            await sock.groupParticipantsUpdate(groupId, [pJid], 'demote');
            demoted.push(pJid);
          } catch (e) {
            console.error('[panic demote error]', e.message);
          }
        }

        let text = `🚨 *PANIC MODE ACTIVATED*\n\n🔒 Group has been locked.\n`;
        text += `👑 *Demoted: ${demoted.length}*`;
        if (skipped.length > 0) text += `\n🛡️ *Protected: ${skipped.length}*`;
        await extra.reply(text);
      } else {
        await extra.reply('🚨 *PANIC MODE ACTIVATED*\n\n🔒 Group has been locked.');
      }
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
