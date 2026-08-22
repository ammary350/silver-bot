const config = require('../../config');

module.exports = {
  name: 'status',
  aliases: ['botstatus', 'botinfo'],
  category: 'general',
  description: 'Show bot status and statistics',
  usage: '.status',

  async execute(sock, msg, args, extra) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

    const memUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const memTotal = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

    let groupCount = 0;
    try {
      const store = sock.store;
      if (store && store.groupMetadata) {
        groupCount = Object.keys(store.groupMetadata).length;
      }
    } catch (e) {}

    const text = `╭━━『 *Bot Status* 』━━╮\n\n⏱️ *Uptime:* ${uptimeStr}\n💾 *Memory:* ${memUsed}MB / ${memTotal}MB\n👥 *Groups:* ${groupCount}\n📦 *Version:* 1.0.0\n🏷️ *Prefix:* ${config.prefix}\n🤖 *Name:* ${config.botName}\n\n> ${config.botName}\n╰━━━━━━━━━━━━━━━━━╯`;

    await extra.reply(text);
  }
};
