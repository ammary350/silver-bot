const database = require('../../database');

module.exports = {
  name: 'chat',
  aliases: ['autochat'],
  category: 'general',
  description: 'Toggle auto-chat feature',
  usage: '.chat on/off',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const action = args[0]?.toLowerCase();

      if (!action || !['on', 'off'].includes(action)) {
        const config = database.getAutochatConfig();
        const status = config.enabled ? '✅ Enabled' : '❌ Disabled';
        return extra.reply(`💬 *Auto-Chat*\n\nStatus: ${status}\nSchedule: ${config.time || '22:00'}\n\nUsage: .chat on/off\nSet time: .chattime <HH:MM>`);
      }

      const enable = action === 'on';
      database.setAutochatConfig({ enabled: enable });

      await extra.reply(`✅ Auto-chat ${enable ? 'enabled' : 'disabled'}!`);
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
