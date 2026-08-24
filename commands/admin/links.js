const linkhub = require('../../src/features/linkhub');

module.exports = {
  name: 'links',
  aliases: [],
  category: 'admin',
  groupOnly: true,
  async execute(sock, msg, args, extra) {
    try {
      if (!linkhub.isHub(extra.from)) {
        return extra.reply('❌ This command can only be used in the configured link-setup group.');
      }
      return await linkhub.createMenu(sock, extra.from, extra.reply);
    } catch (error) {
      console.error('[links error]', error.message);
      return extra.reply(`❌ Unable to load group links: ${error.message}`);
    }
  }
};