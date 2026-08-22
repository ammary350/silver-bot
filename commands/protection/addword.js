const database = require('../../database');

module.exports = {
  name: 'addword',
  aliases: ['banword'],
  category: 'protection',
  description: 'Add a banned word to this group',
  usage: '.addword <word>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) return extra.reply('Usage: .addword <word>\nExample: .addword scam');
      const word = args.join(' ').toLowerCase().trim();
      if (word.length < 1) return extra.reply('Word too short.');
      const added = database.addAntiWord(extra.from, word);
      if (added) {
        await extra.reply(`✅ Banned word added: "${word}"`);
      } else {
        await extra.reply(`ℹ️ "${word}" is already banned.`);
      }
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};