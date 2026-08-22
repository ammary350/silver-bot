const database = require('../../database');

module.exports = {
  name: 'detc',
  aliases: ['detect', 'promodetection'],
  category: 'protection',
  description: 'Toggle admin promotion detection & logging for this group',
  usage: '.detc on/off',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const settings = database.getGroupSettings(extra.from);
      if (!args.length) {
        const state = settings.detc ? 'enabled' : 'disabled';
        return extra.reply(`📋 Promotion detection is currently *${state}* for this group.\n\nUsage: .detc on / .detc off`);
      }
      const arg = args[0].toLowerCase();
      if (arg === 'on' || arg === 'enable' || arg === '1') {
        database.updateGroupSettings(extra.from, { detc: true });
        return extra.reply('✅ Promotion detection & logging enabled.\nAdmin promotions will be logged and unauthorized admins auto-demoted.');
      } else if (arg === 'off' || arg === 'disable' || arg === '0') {
        database.updateGroupSettings(extra.from, { detc: false });
        return extra.reply('✅ Promotion detection disabled.');
      }
      return extra.reply('Usage: .detc on / .detc off');
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
