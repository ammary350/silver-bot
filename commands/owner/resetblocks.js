const database = require('../../database');

module.exports = {
  name: 'resetblocks',
  aliases: [],
  category: 'owner',
  description: 'Clear the complete global blocklist',
  usage: '.resetblocks',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!database.resetBlockedNumbers()) {
        return extra.reply('❌ Could not reset the blocklist.');
      }
      return extra.reply('✅ The blocklist has been completely reset.');
    } catch (error) {
      console.error('[resetblocks error]', error.message);
      return extra.reply(`❌ Error: ${error.message}`);
    }
  }
};