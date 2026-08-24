const database = require('../../database');

module.exports = {
  name: 'antiacc',
  aliases: ['anticon', 'anticonnect'],
  category: 'admin',
  description: 'Show automatic global anti-contact card protection',
  usage: '.antiacc',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      return extra.reply('✅ الحماية من بطاقات جهات الاتصال مفعّلة تلقائياً في الخاص وكل مجموعة يكون bot فيها مشرفاً.');
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
