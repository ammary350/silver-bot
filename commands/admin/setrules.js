const database = require('../../database');

module.exports = {
  name: 'setrules',
  aliases: ['addrules'],
  category: 'admin',
  description: 'Set group rules',
  usage: '.setrules <rules text>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        return extra.reply('Usage: .setrules <rules text>\nExample: .setrules No spam, be respectful');
      }

      const rules = args.join(' ');
      database.updateGroupSettings(extra.from, { joinrulesMessage: rules });

      await extra.reply(`✅ Group rules updated!\n\n*Rules:*\n${rules}`);
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
