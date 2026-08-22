const database = require('../../database');

module.exports = {
  name: 'rules',
  aliases: ['grules', 'grouprules'],
  category: 'protection',
  description: 'Show group rules',
  usage: '.rules',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const gs = database.getGroupSettings(extra.from);
      const text = gs.joinrulesMessage || 'No rules have been set for this group.';
      await sock.sendMessage(extra.from, { text: `╭━━『 *Group Rules* 』━━╮\n\n${text}\n\n╰━━━━━━━━━━━━━━━╯` }, { quoted: msg });
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};