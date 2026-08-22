const database = require('../../database');

module.exports = {
  name: 'deladm',
  aliases: ['deladmin', 'unapproveadmin'],
  category: 'roles',
  description: 'Remove bot admin approval (owner/co-owner only)',
  usage: '.deladm <@mention|number>',
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
        return extra.reply('Usage: .deladm <@mention or number>\nExample: .deladm @user');
      }
      if (!database.isBotAdminApproved(target)) {
        return extra.reply(`ℹ️ @${target.split('@')[0]} is not a bot admin.`);
      }
      const removed = database.removeBotAdmin(target);
      if (removed) {
        await extra.reply(`✅ Removed @${target.split('@')[0]} from bot admins.\nThey will be demoted if promoted in groups.`);
      } else {
        await extra.reply(`❌ Failed to remove bot admin.`);
      }
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
