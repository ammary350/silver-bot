const database = require('../../database');

module.exports = {
  name: 'addblock',
  aliases: ['blk'],
  category: 'owner',
  description: 'Add a number to the global blocklist',
  usage: '.addblock <number> <reason>',
  coOwnerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        return extra.reply('❌ Usage: .addblock <number> <reason>\nExample: .addblock 212600000000 spam');
      }
      const number = args[0].replace(/[^0-9]/g, '');
      if (number.length < 7) {
        return extra.reply('❌ Invalid number. Must be at least 7 digits.');
      }
      const reason = args.slice(1).join(' ').trim() || 'No reason provided';
      const result = database.addBlockedNumber(number);
      if (!result.success) {
        if (result.error === 'already blocked') {
          return extra.reply(`⚠️ Number ${number} is already in the blocklist.`);
        }
        return extra.reply(`❌ ${result.error}`);
      }
      await extra.reply(`🚫 *Number Blocked*\n📞 Number: ${number}`);
    } catch (e) {
      console.error('[addblock error]', e.message);
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
