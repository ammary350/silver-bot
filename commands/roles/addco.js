const database = require('../../database');

module.exports = {
  name: 'addco',
  aliases: ['addcoowner', 'makeco'],
  category: 'roles',
  description: 'Add a co-owner (owner only)',
  usage: '.addco <@mention|number>',
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
        return extra.reply('Usage: .addco <@mention or number>\nExample: .addco @user');
      }
      const added = database.addCoOwner(target);
      if (added) {
        await extra.reply(`✅ Added @${target.split('@')[0]} as co-owner.`);
      } else {
        await extra.reply(`ℹ️ @${target.split('@')[0]} is already a co-owner.`);
      }
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};