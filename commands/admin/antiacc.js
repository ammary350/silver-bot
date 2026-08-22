const database = require('../../database');

module.exports = {
  name: 'antiacc',
  aliases: ['anticon', 'anticonnect'],
  category: 'admin',
  description: 'Toggle anti-contact card protection',
  usage: '.antiacc on/off',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        const settings = database.getGroupSettings(extra.from);
        const state = settings.antiacc ? 'enabled' : 'disabled';
        return extra.reply(`📋 Anti-contact protection is currently *${state}* for this group.\n\nUsage: .antiacc on / .antiacc off`);
      }
      const arg = args[0].toLowerCase();
      if (arg === 'on' || arg === 'enable' || arg === '1') {
        database.updateGroupSettings(extra.from, { antiacc: true });
        return extra.reply('✅ Anti-contact protection enabled.\nMembers who send contact cards will be removed and the group will be locked.');
      } else if (arg === 'off' || arg === 'disable' || arg === '0') {
        database.updateGroupSettings(extra.from, { antiacc: false });
        return extra.reply('✅ Anti-contact protection disabled.');
      }
      return extra.reply('Usage: .antiacc on / .antiacc off');
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
