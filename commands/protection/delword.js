const database = require('../../database');

module.exports = {
  name: 'delword',
  aliases: ['unbanword'],
  category: 'protection',
  description: 'Remove a banned word from this group',
  usage: '.delword <word>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) return extra.reply('Usage: .delword <word>\nExample: .delword scam');
      const word = args.join(' ').toLowerCase().trim();
      const removed = database.removeAntiWord(extra.from, word);
      if (removed) {
        await extra.reply(`✅ Removed banned word: "${word}"`);
      } else {
        await extra.reply(`ℹ️ "${word}" was not in the banned list.`);
      }
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};