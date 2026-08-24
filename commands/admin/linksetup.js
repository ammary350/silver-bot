const linkhub = require('../../src/features/linkhub');

module.exports = {
  name: 'linksetup',
  aliases: [],
  category: 'admin',
  groupOnly: true,
  coOwnerOnly: true,
  async execute(sock, msg, args, extra) {
    const action = String(args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(action)) return extra.reply('الاستخدام: .linksetup on أو .linksetup off');
    if (action === 'on') {
      linkhub.setHub(extra.from);
      return extra.reply('✅ تم تعيين هذه المجموعة كمركز الروابط الحصري.');
    }
    linkhub.clearHub();
    return extra.reply('✅ تم إلغاء مركز الروابط الحصري.');
  }
};