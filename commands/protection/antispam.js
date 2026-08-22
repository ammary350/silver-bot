const database = require('../../database');

module.exports = {
  name: 'antispam',
  aliases: ['spam'],
  category: 'protection',
  description: 'Toggle anti-spam protection for this group',
  usage: '.antispam on/off',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        const current = database.getGroupSettings(extra.from);
        return extra.reply(`Anti-spam is currently: ${current.antispam ? '✅ ON' : '❌ OFF'}\n\nUsage: .antispam on|off\n- .spamtime <ms> (time window)\n- .spamlimit <count> (max msgs in window)`);
      }
      const action = args[0].toLowerCase();
      if (action === 'on') {
        database.updateGroupSettings(extra.from, { antispam: true });
        await extra.reply('✅ Anti-spam enabled. 3 messages in 4s will lock the group.');
      } else if (action === 'off') {
        database.updateGroupSettings(extra.from, { antispam: false });
        await extra.reply('❌ Anti-spam disabled.');
      } else {
        await extra.reply('Usage: .antispam on|off');
      }
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};