const database = require('../../database');

module.exports = {
  name: 'antidelete',
  aliases: ['antidel', 'antirevoke'],
  category: 'protection',
  description: 'تفعيل/تعطيل كشف حذف الرسائل',
  usage: '.antidelete on/off',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        const gs = database.getGroupSettings(extra.from);
        const status = gs.antidelete ? '✅ ON' : '❌ OFF';
        const action = gs.antideleteAction || 'log';
        return extra.reply(
          `🗑️ *كشف الحذف*\n\n` +
          `الحالة: ${status}\n` +
          `الإجراء: ${action}\n\n` +
          `استخدام:\n` +
          `  .antidelete on\n` +
          `  .antidelete off\n` +
          `  .antidelete set log`
        );
      }

      const opt = args[0].toLowerCase();

      if (opt === 'on') {
        database.updateGroupSettings(extra.from, { antidelete: true });
        return extra.reply('✅ تم تفعيل كشف حذف الرسائل.\nسيتم إرسال إشعار عند حذف رسالة.');
      }

      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antidelete: false });
        return extra.reply('❌ تم تعطيل كشف حذف الرسائل.');
      }

      if (opt === 'set') {
        const action = (args[1] || '').toLowerCase();
        if (action !== 'log') return extra.reply('❌ الإجراء المتاح: log');
        database.updateGroupSettings(extra.from, { antideleteAction: action, antidelete: true });
        return extra.reply(`✅ تم ضبط كشف الحذف على: ${action}`);
      }

      return extra.reply('❌ استخدم: .antidelete on/off');
    } catch (e) {
      await extra.reply(`❌ خطأ: ${e.message}`);
    }
  }
};