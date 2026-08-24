const database = require('../../database');

module.exports = {
  name: 'dailyreport',
  aliases: ['report'],
  category: 'owner',
  description: 'Send the owner a private daily summary of blocklist activity and actions',
  usage: '.dailyreport',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const summary = database.getDailySummary();
      const metrics = summary.metrics || {};
      const blocklist = Array.isArray(summary.numbers) ? summary.numbers : [];
      const ordered = Object.entries(metrics).sort((a, b) => Number(b[1]) - Number(a[1]));

      let text = `📊 *Daily Report*\n\n`;
      text += `📅 Date: ${summary.date}\n`;
      text += `🚫 Blocked Numbers: ${summary.totalNumbers}\n`;
      text += `📈 Total Actions: ${summary.totalActions}\n\n`;

      if (ordered.length) {
        text += `*Action Summary*\n`;
        for (const [key, value] of ordered) {
          text += `• ${key}: ${value}\n`;
        }
        text += '\n';
      } else {
        text += `*Action Summary*\n• No actions recorded yet.\n\n`;
      }

      if (blocklist.length) {
        text += `*Recent Block Entries*\n`;
        for (let i = 0; i < Math.min(blocklist.length, 8); i++) {
          const entry = blocklist[i];
          const reason = entry.reason || 'manual';
          const action = entry.action || 'block';
          text += `• ${database.formatNumber(entry.number || '') || entry.number} — ${reason} (${action})\n`;
        }
      } else {
        text += `*Recent Block Entries*\n• No blocked numbers recorded today.\n`;
      }

      if (extra && extra.sender) {
        await sock.sendMessage(extra.sender, { text: text.trim() });
      }

      await extra.reply('✅ *Daily report sent privately to the owner.*');
    } catch (error) {
      console.error('[dailyreport error]', error);
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};