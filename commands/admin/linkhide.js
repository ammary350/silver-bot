const linkhub = require('../../src/features/linkhub');

module.exports = {
  name: 'linkhide',
  aliases: ['linkshow'],
  category: 'admin',
  groupOnly: true,
  coOwnerOnly: true,
  async execute(sock, msg, args, extra) {
    const hidden = extra.commandName !== 'linkshow';
    linkhub.setHidden(extra.from, hidden);
    return extra.reply(hidden ? '✅ تم إخفاء هذه المجموعة من قائمة الروابط.' : '✅ تم إظهار هذه المجموعة في قائمة الروابط.');
  }
};