const database = require('../../database');
const config = require('../../config');
const { findParticipant, normalizeJidWithLid } = require('../../src/core/jid');

// Resolve a role record (digits or JID, possibly LID) to a usable PN JID.
// Returns '' when the record cannot be resolved to a phone-number JID.
const toPnJid = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const raw = String(value).trim();
  const jid = raw.includes('@')
    ? normalizeJidWithLid(raw)
    : `${database.normalizeNumber(raw)}@s.whatsapp.net`;
  if (!jid.includes('@s.whatsapp.net')) return '';
  return jid;
};

// True when the role holder is a participant of the current group.
// Uses LID/PN-aware matching, with a numeric fallback for unmatched identities.
const isInGroup = (groupMetadata, jid) => {
  if (!groupMetadata || !Array.isArray(groupMetadata.participants)) return false;
  if (findParticipant(groupMetadata.participants, jid)) return true;
  const targetNum = database.normalizeNumber(jid);
  if (!targetNum) return false;
  return groupMetadata.participants.some(p => {
    const pid = (p && (p.id || p.jid || p.participant)) || '';
    return database.normalizeNumber(pid) === targetNum;
  });
};

module.exports = {
  name: 'roles',
  aliases: ['rolelist', 'perms', 'permissions'],
  category: 'roles',
  description: 'Show role hierarchy and current role holders',
  usage: '.roles',

  async execute(sock, msg, args, extra) {
    try {
      const mentions = [extra.sender];
      const groupMetadata = extra.groupMetadata || null;

      // In-group holder -> real mention (@number + JID in mentions array).
      // Out-of-group holder -> phone number shown normally, no mention.
      const holderLine = (emoji, value, emptyText) => {
        if (value === undefined || value === null || String(value).trim() === '') {
          return `  ${emoji} ${emptyText}`;
        }
        const jid = toPnJid(value);
        if (jid && isInGroup(groupMetadata, jid)) {
          mentions.push(jid);
          return `  ${emoji} @${jid.split(':')[0].split('@')[0]}`;
        }
        const digits = database.normalizeNumber(value);
        return `  ${emoji} ${digits ? database.formatNumber(digits) : value}`;
      };

      const ownerList = config.ownerNumber.map(n => holderLine('👑', n, '')).join('\n');
      const botNum = database.getBotNumber();
      const botLine = botNum ? holderLine('🤖', botNum, '') : '  🤖 Not set';
      const coowners = database.getCoOwners();
      const coList = coowners.length ? coowners.map(c => holderLine('⭐', c, '')).join('\n') : '  (none)';
      const botAdmins = database.getBotAdmins();
      const admList = botAdmins.length ? botAdmins.map(a => holderLine('🛡️', a, '')).join('\n') : '  (none)';

      const text = `╭━━『 *Role System* 』━━╮

*👑 Owner* (highest authority)
${ownerList}

*🤖 Bot* (runtime identity)
${botLine}

*⭐ Co-owner* (strong management)
${coList}

*🛡️ Bot Admin* (moderation, no role assignment)
${admList}

╰━━━━━━━━━━━━━━━╯`;

      await sock.sendMessage(extra.from, { text, mentions }, { quoted: msg });
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};