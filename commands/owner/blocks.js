const database = require('../../database');

module.exports = {
  name: 'blocks',
  aliases: ['blist', 'bans'],
  category: 'owner',
  description: 'Show all blocked numbers',
  usage: '.blocks',
  coOwnerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const entries = database.getRichBlocklist();
      if (entries.length === 0) {
        return extra.reply('📋 Blocklist is empty.');
      }
      const total = entries.length;
      const showCount = Math.min(total, 30);
      let text = `🚫 *Blocklist (${total} total)*\n\n`;
      for (let i = 0; i < showCount; i++) {
        const e = entries[i];
        text += `${i + 1}. ${database.formatNumber(e.number)}`;
        if (e.reason) text += ` (${e.reason})`;
        if (e.date) text += ` — ${new Date(e.date).toLocaleDateString()}`;
        text += '\n';
      }
      if (total > showCount) {
        text += `\n... and ${total - showCount} more entries.\nUse .check <number> to look up a specific number.`;
      }
      await extra.reply(text.trim());
    } catch (e) {
      console.error('[blocks error]', e.message);
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};