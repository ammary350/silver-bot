module.exports = {
  name: 'unlock',
  aliases: ['open', 'opengroup'],
  category: 'protection',
  description: 'Unlock the group (all members can send messages)',
  usage: '.unlock',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      await sock.groupSettingUpdate(extra.from, 'not_announcement');
      await extra.react('🔓');
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};