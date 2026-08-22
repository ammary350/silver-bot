const database = require('../../database');

module.exports = {
  name: 'delco',
  aliases: ['delcoowner', 'removeco'],
  category: 'roles',
  description: 'Remove a co-owner (owner only)',
  usage: '.delco <@mention|number>',
  ownerOnly: true,

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
        return extra.reply('Usage: .delco <@mention or number>\nExample: .delco @user');
      }
      const removed = database.removeCoOwner(target);
      if (removed) {
        await extra.reply(`✅ Removed @${target.split('@')[0]} from co-owners.`);
      } else {
        await extra.reply(`ℹ️ @${target.split('@')[0]} is not a co-owner.`);
      }
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};