const database = require('../../database');

module.exports = {
  name: 'blocks',
  aliases: ['blist', 'bans', 'blocklist'],
  category: 'owner',
  description: 'Show all blocked numbers',
  usage: '.blocks [page]',
  coOwnerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const entries = database.getRichBlocklist();
      if (entries.length === 0) {
        return extra.reply('📋 Blocklist is empty.');
      }
      const pageInput = args[0] || '1';
      const page = /^\d+$/.test(pageInput) ? Number(pageInput) : 1;
      if (!Number.isInteger(page) || page < 1) return extra.reply('❌ Page must be a positive number.');
      const pageSize = 10;
      const total = entries.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (page > totalPages) return extra.reply(`❌ Page ${page} does not exist. Choose a page from 1 to ${totalPages}.`);

      const start = (page - 1) * pageSize;
      const pageEntries = entries.slice(start, start + pageSize);
      const mentions = [];
      const lines = pageEntries.map((entry, index) => {
        const storedId = String(entry.jid || entry.number || '');
        const isGroup = storedId.includes('@g.us');
        const digits = storedId.replace(/\D/g, '');
        const target = digits ? (isGroup ? `[Group] ${digits}` : `+${formatInternationalNumber(digits)} (wa.me/${digits})`) : '[Unknown]';
        if (digits && !isGroup) mentions.push(`${digits}@s.whatsapp.net`);
        const details = [entry.reason, entry.date ? new Date(entry.date).toLocaleDateString() : '']
          .filter(Boolean)
          .join(' | ');
        return `${start + index + 1}. ${target}${details ? `\n   ${details}` : ''}`;
      });

      await sock.sendMessage(extra.from, {
        text: `🚫 *Blocklist*\n\n${lines.join('\n\n')}\n\nPage ${page} of ${totalPages} | Total: ${total}`,
        mentions
      }, { quoted: msg });
    } catch (e) {
      console.error('[blocks error]', e.message);
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};

function formatInternationalNumber(digits) {
  if (digits.length <= 3) return digits;
  const groups = [];
  let remaining = digits;
  const suffixes = [4, 3, 2];
  for (const size of suffixes) {
    if (remaining.length <= size) break;
    groups.unshift(remaining.slice(-size));
    remaining = remaining.slice(0, -size);
  }
  if (remaining) groups.unshift(remaining);
  return groups.join(' ');
}