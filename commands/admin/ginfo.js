const config = require('../../config');

module.exports = {
  name: 'ginfo',
  aliases: ['groupinfo'],
  category: 'admin',
  description: 'Show group information',
  usage: '.ginfo',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const meta = extra.groupMetadata;
      const participants = meta.participants || [];
      const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
      const creation = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown';

      const text = `╭━━『 *Group Info* 』━━╮\n\n📛 *Name:* ${meta.subject}\n🆔 *ID:* ${extra.from}\n📝 *Description:* ${meta.desc || 'None'}\n📅 *Created:* ${creation}\n👥 *Members:* ${participants.length}\n👑 *Admins:* ${admins.length}\n\n> *${config.botName}*`;

      await extra.reply(text);
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
