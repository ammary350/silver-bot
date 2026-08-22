const database = require('../../database');

module.exports = {
  name: 'spamlimit',
  aliases: ['spamthreshold'],
  category: 'protection',
  description: 'Set max messages allowed within spam time window',
  usage: '.spamlimit <count>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        const current = database.getGroupSettings(extra.from);
        return extra.reply(`Current spam limit: ${current.spamlimit} messages\n\nUsage: .spamlimit <number>\nExample: .spamlimit 5`);
      }
      const limit = parseInt(args[0]);
      if (isNaN(limit) || limit < 2 || limit > 20) {
        return extra.reply('Limit must be between 2 and 20.');
      }
      database.updateGroupSettings(extra.from, { spamlimit: limit });
      await extra.reply(`✅ Spam limit set to ${limit} messages.`);
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};