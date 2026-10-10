global.allowedDownloadGroups = global.allowedDownloadGroups || new Set();

module.exports = {
  name: 'setdown',
  aliases: [],
  category: 'owner',
  description: 'Toggle media downloads for the current group',
  usage: '.setdown',

  async execute(sock, msg, args, extra) {
    if (!extra.isOwner) {
      return extra.reply('❌ هذا الأمر مخصص لمالك البوت فقط.');
    }
    if (!extra.isGroup) {
      return extra.reply('❌ هذا الأمر متاح داخل المجموعات فقط.');
    }

    const groups = global.allowedDownloadGroups;
    if (groups.has(extra.from)) {
      groups.delete(extra.from);
      return extra.reply('✅ تم إلغاء تفعيل ميزة التحميل في هذه المجموعة.');
    }

    groups.add(extra.from);
    return extra.reply('✅ تم تفعيل ميزة التحميل في هذه المجموعة.');
  },
};
