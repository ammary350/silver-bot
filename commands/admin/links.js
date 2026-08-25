const linkhub = require('../../src/features/linkhub');
const permissions = require('../../src/core/permissions');

module.exports = {
  name: 'links',
  aliases: [],
  category: 'admin',
  groupOnly: true,
  async execute(sock, msg, args, extra) {
    try {
      const isHubGroup = linkhub.isHub(extra.from);
      if (!isHubGroup && !permissions.isOwner(extra.sender)) {
        return extra.reply('❌ This command is only available to the owner outside the link hub.');
      }
      await sock.sendMessage(extra.from, { text: '⏳ جاري البحث...' }, { quoted: msg });
      return await linkhub.createMenu(sock, extra.from, extra.reply);
    } catch (error) {
      console.error('[links error]', error.message);
      return extra.reply(`❌ Unable to load group links: ${error.message}`);
    }
  }
};