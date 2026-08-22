module.exports = {
  name: 'lock',
  aliases: ['close', 'closegroup'],
  category: 'protection',
  description: 'Lock the group (admins only can send messages)',
  usage: '.lock',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      await sock.groupSettingUpdate(extra.from, 'announcement');
      await extra.react('🔒');
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};