const database = require('../../database');

module.exports = {
  name: 'unmute',
  aliases: ['unsilent'],
  category: 'admin',
  description: 'Unmute the bot (bot resumes replying)',
  usage: '.unmute',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      database.updateGroupSettings(extra.from, { mute: false });
      await extra.reply('🔊 تم إلغاء كتم البوت\nسيعود البوت للرد في هذه المجموعة');
    } catch (error) {
      await extra.reply(`❌ خطأ: ${error.message}`);
    }
  }
};
  