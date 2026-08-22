const database = require('../../database');

module.exports = {
  name: 'setreqmsg',
  aliases: ['setapprovemsg', 'approvemsg'],
  category: 'admin',
  description: 'Set the custom approval message sent after approving join requests',
  usage: '.setreqmsg <message>',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        const current = database.getApprovalMessage(extra.from);
        const display = current || '*(none — using default)*';
        return extra.reply(`📝 Current approval message:\n${display}\n\nTo change: .setreqmsg <your message>`);
      }
      const message = args.join(' ').trim();
      if (message.length > 500) {
        return extra.reply('❌ Message too long (max 500 characters).');
      }
      database.setApprovalMessage(extra.from, message);
      await extra.reply(`✅ Approval message saved:\n${message}`);
    } catch (e) {
      console.error('[setreqmsg error]', e.message);
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
