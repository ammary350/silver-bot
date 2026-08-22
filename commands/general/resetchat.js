const database = require('../../database');

module.exports = {
  name: 'resetchat',
  aliases: ['clearchat', 'chattime'],
  category: 'general',
  description: 'Reset or set auto-chat schedule time',
  usage: '.resetchat <HH:MM>',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        const config = database.getAutochatConfig();
        return extra.reply(`💬 *Auto-Chat Settings*\n\nEnabled: ${config.enabled ? '✅' : '❌'}\nSchedule: ${config.time || '22:00'}\n\nUsage: .chattime <HH:MM>\nExample: .chattime 22:00`);
      }

      const time = args[0];
      if (!/^\d{1,2}:\d{2}$/.test(time)) {
        return extra.reply('❌ Invalid time format. Use HH:MM (e.g., 22:00)');
      }

      database.setAutochatConfig({ time });
      await extra.reply(`✅ Auto-chat schedule set to *${time}*`);
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
