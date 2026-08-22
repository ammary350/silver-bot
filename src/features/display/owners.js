/**
 * Owner/number display helpers — canonical formatting for the owner list.
 * Rules:
 *  - owner numbers come from config (never modified here)
 *  - the bot's own number is always shown first, labeled "C Owner"
 *  - numbers are rendered in international format (+CC XXX XXX XXX)
 *  - JIDs are resolved to plain numbers when possible
 */

const database = require('../../storage/database');
const config = require('../../config');

function formatOwnerNumber(num) {
  const digits = database.normalizeNumber(num);
  if (!digits) return '';
  const formatted = database.formatNumber(digits);
  return formatted || digits;
}

function getOwnerLines() {
  const botDigits = database.normalizeNumber(database.getBotNumber());
  const owners = (Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber])
    .map(database.normalizeNumber)
    .filter(Boolean);

  const entries = [];
  if (botDigits) entries.push({ num: botDigits, isBot: true });
  for (const owner of owners) {
    if (!entries.some(e => e.num === owner)) {
      entries.push({ num: owner, isBot: false });
    }
  }

  return entries.map((entry, index) => {
    const label = entry.isBot || index === 0 ? 'C Owner' : 'Owner';
    return `👑 *${label}:* ${formatOwnerNumber(entry.num)}`;
  });
}

module.exports = { formatOwnerNumber, getOwnerLines };