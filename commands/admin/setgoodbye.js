const database = require('../../database');

module.exports = {
  name: 'setgoodbye',
  aliases: ['setgoodbyemsg'],
  category: 'admin',
  description: 'Set custom goodbye message',
  usage: '.setgoodbye <message>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        return extra.reply('Usage: .setgoodbye <message>\nUse @user for username, @group for group name\nExample: .setgoodbye Goodbye @user!');
      }

      const message = args.join(' ');
      database.updateGroupSettings(extra.from, { goodbyeMessage: message });

      await extra.reply(`✅ Goodbye message updated!\n\n*Message:*\n${message}\n\nUse *@user* for username, *@group* for group name`);
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
