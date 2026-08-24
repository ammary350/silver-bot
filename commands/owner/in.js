const INVITE_URL = /^https?:\/\/(?:www\.)?chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})(?:[/?#].*)?$/i;

module.exports = {
  name: 'in',
  aliases: ['join'],
  category: 'owner',
  description: 'Join a WhatsApp group from an invite link',
  usage: '.in https://chat.whatsapp.com/<invite-code>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const link = args.join(' ').trim();
    const match = INVITE_URL.exec(link);
    if (!match) {
      return extra.reply('❌ رابط الدعوة غير صالح. الاستخدام: .in https://chat.whatsapp.com/<invite-code>');
    }

    try {
      const groupId = await sock.groupAcceptInvite(match[1]);
      return extra.reply(`✅ تم الانضمام إلى المجموعة بنجاح${groupId ? `: ${groupId}` : '!'}`);
    } catch (error) {
      return extra.reply(`❌ تعذر الانضمام إلى المجموعة: ${error.message}`);
    }
  }
};
