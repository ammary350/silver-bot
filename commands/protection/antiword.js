const database = require('../../database');

module.exports = {
  name: 'antiword',
  aliases: ['wordfilter'],
  category: 'protection',
  description: 'Toggle banned word filtering for this group',
  usage: '.antiword on/off',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        const current = database.getGroupSettings(extra.from);
        const words = database.getAntiWords(extra.from);
        const wordList = words.length ? words.join(', ') : '(none)';
        return extra.reply(`Anti-word is currently: ${current.antiword ? '✅ ON' : '❌ OFF'}\nBanned words: ${wordList}\n\nUsage: .antiword on|off\n.addword <word>\n.delword <word>`);
      }
      const action = args[0].toLowerCase();
      if (action === 'on') {
        database.updateGroupSettings(extra.from, { antiword: true });
        await extra.reply('✅ Anti-word enabled. Banned messages will be deleted.');
      } else if (action === 'off') {
        database.updateGroupSettings(extra.from, { antiword: false });
        await extra.reply('❌ Anti-word disabled.');
      } else {
        await extra.reply('Usage: .antiword on|off');
      }
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};