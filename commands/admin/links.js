const linkhub = require('../../src/features/linkhub');

module.exports = {
  name: 'links',
  aliases: [],
  category: 'admin',
  groupOnly: true,
  async execute(sock, msg, args, extra) {
    if (!linkhub.isHub(extra.from)) return;
    return linkhub.createMenu(sock, extra.from, extra.reply);
  }
};