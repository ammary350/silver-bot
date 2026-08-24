const database = require('../../database');

module.exports = {
  name: 'blocks',
  aliases: ['blist', 'bans', 'blocklist'],
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
        const storedId = String(e.jid || e.number || '');
        const isGroup = storedId.includes('@g.us');
        const digits = storedId.replace(/[^0-9]/g, '');
        const displayNumber = digits ? `+${digits}` : storedId;
        text += `${i + 1}) ${isGroup ? '[Group] ' : ''}${displayNumber}\n`;
        if (e.reason) text += `   Reason: ${e.reason}\n`;
        if (e.date) text += `   Added: ${new Date(e.date).toLocaleDateString()}\n`;
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