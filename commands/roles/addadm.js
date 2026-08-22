const database = require('../../database');

module.exports = {
  name: 'addadm',
  aliases: ['addadmin', 'approveadmin'],
  category: 'roles',
  description: 'Approve a user as bot admin (owner/co-owner only)',
  usage: '.addadm <@mention|number>',
  coOwnerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      let target = '';
      if (ctxInfo?.mentionedJid?.length) {
        target = ctxInfo.mentionedJid[0];
      } else if (args.length) {
        let num = args[0].replace(/[^0-9]/g, '');
        if (num) target = `${num}@s.whatsapp.net`;
      }
      if (!target) {
        return extra.reply('Usage: .addadm <@mention or number>\nExample: .addadm @user');
      }
      if (database.isBotAdminApproved(target)) {
        return extra.reply(`ℹ️ @${target.split('@')[0]} is already an approved bot admin.`);
      }
      const added = database.addBotAdmin(target);
      if (added) {
        await extra.reply(`✅ Approved @${target.split('@')[0]} as bot admin.\nThey will not be auto-demoted from WhatsApp admin groups.`);
      } else {
        await extra.reply(`❌ Failed to add bot admin.`);
      }
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
