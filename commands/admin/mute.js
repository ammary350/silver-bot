const database = require('../../database');

module.exports = {
  name: 'mute',
  aliases: ['silent'],
  category: 'admin',
  description: 'Toggle bot silence (bot stops replying in this group)',
  usage: '.mute',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const gs = database.getGroupSettings(extra.from);
      const newState = !gs.mute;
      database.updateGroupSettings(extra.from, { mute: newState });

      if (newState) {
        await extra.reply('🤖 تم كتم البوت في هذه المجموعة\nلن يرد البوت على أي رسالة حتى يتم إلغاء الكتم');
      } else {
        await extra.reply('🔊 تم إلغاء كتم البوت\nسيعود البوت للرد في هذه المجموعة');
      }
    } catch (error) {
      await extra.reply(`❌ خطأ: ${error.message}`);
    }
  }
};
  