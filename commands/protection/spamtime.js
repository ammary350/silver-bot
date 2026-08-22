const database = require('../../database');

module.exports = {
  name: 'spamtime',
  aliases: ['spamwindow'],
  category: 'protection',
  description: 'Set anti-spam time window in milliseconds',
  usage: '.spamtime <ms>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        const current = database.getGroupSettings(extra.from);
        return extra.reply(`Current spam time window: ${current.spamtime}ms\n\nUsage: .spamtime <milliseconds>\nExample: .spamtime 4000`);
      }
      const ms = parseInt(args[0]);
      if (isNaN(ms) || ms < 1000 || ms > 60000) {
        return extra.reply('Time must be between 1000 (1s) and 60000 (60s).');
      }
      database.updateGroupSettings(extra.from, { spamtime: ms });
      await extra.reply(`✅ Spam time window set to ${ms}ms.`);
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};