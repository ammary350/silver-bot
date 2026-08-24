const database = require('../../database');

module.exports = {
  name: 'delblock',
  aliases: ['unblk', 'unban', 'removeblock'],
  category: 'owner',
  description: 'Remove a number from the global blocklist',
  usage: '.delblock <number>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        return extra.reply('❌ Usage: .delblock <number>\nExample: .delblock 212600000000');
      }
      const number = args[0].replace(/[^0-9]/g, '');
      if (number.length < 7) {
        return extra.reply('❌ Invalid number. Must be at least 7 digits.');
      }
      const result = database.removeBlockedNumber(number);
      if (!result.success) {
        if (result.error === 'not found') {
          return extra.reply(`⚠️ Number ${number} is not in the blocklist.`);
        }
        return extra.reply(`❌ ${result.error}`);
      }
      await extra.reply(`✅ *Number Unblocked*\n📞 Number: ${number} removed from blocklist.`);
    } catch (e) {
      console.error('[delblock error]', e.message);
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
