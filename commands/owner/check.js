const database = require('../../database');

module.exports = {
  name: 'check',
  aliases: ['lookup'],
  category: 'owner',
  description: 'Check if a number is in the global blocklist',
  usage: '.check <number>',
  coOwnerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        return extra.reply('❌ Usage: .check <number>\nExample: .check 212600000000');
      }
      const number = args[0].replace(/[^0-9]/g, '');
      if (number.length < 7) {
        return extra.reply('❌ Invalid number. Must be at least 7 digits.');
      }
      const entry = database.getBlockedEntry(number);
      if (!entry) {
        return extra.reply(`✅ *Number Approved*\n📞 Number: ${database.formatNumber(number)}\nThis number is not in the blocked list.`);
      }
      let text = `🚫 *Blocked Number Found*\n\n`;
      text += `📞 Number: ${database.formatNumber(entry.number)}\n`;
      if (entry.reason) text += `📝 Reason: ${entry.reason}\n`;
      if (entry.date) {
        const d = new Date(entry.date);
        text += `📅 Date: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}\n`;
      }
      if (entry.action) text += `⚡ Action: ${entry.action}\n`;
      if (entry.groupName) text += `👥 Group: ${entry.groupName}\n`;
      await extra.reply(text.trim());
    } catch (e) {
      console.error('[check error]', e.message);
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};