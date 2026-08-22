const config = require('../../config');

module.exports = {
  name: 'alive',
  aliases: ['bot', 'botalive'],
  category: 'general',
  description: 'Check if the bot is alive',
  usage: '.alive',

  async execute(sock, msg, args, extra) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

    const text = `╭━━『 *${config.botName}* 』━━╮\n\n✅ Bot is *alive*!\n⏱️ Uptime: ${uptimeStr}\n📦 Version: 1.0.0\n\n> ${config.botName}\n╰━━━━━━━━━━━━━━━━━╯`;

    await extra.reply(text);
  }
};
