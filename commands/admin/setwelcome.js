const database = require('../../database');

module.exports = {
  name: 'setwelcome',
  aliases: ['setwelcomemsg'],
  category: 'admin',
  description: 'Set custom welcome message',
  usage: '.setwelcome <message>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        return extra.reply('Usage: .setwelcome <message>\nUse @user for username, @group for group name\nExample: .setwelcome Welcome @user to @group!');
      }

      const message = args.join(' ');
      database.updateGroupSettings(extra.from, { welcomeMessage: message });

      await extra.reply(`✅ Welcome message updated!\n\n*Message:*\n${message}\n\nUse *@user* for username, *@group* for group name`);
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
