/**
 * Contact-ban resolver — turns a number, @mention, quoted message, or contact
 * name into a ban target JID.
 *
 * Sources:
 *  1. explicit number (digits only, with country code)
 *  2. @mention / quoted message JIDs
 *  3. contact names — saved contacts (session store) and group push names
 *
 * Multiple matches are reported for disambiguation (never guessed).
 */

const { getContactsMap } = require('../contacts/contactName');

// Pending disambiguation per sender JID → { matches, ttl }
const pendingBans = new Map();
const PENDING_TTL_MS = 2 * 60 * 1000;

function normalizeName(text) {
  if (!text) return '';
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function cleanJid(jid) {
  if (!jid || typeof jid !== 'string') return '';
  return jid.split(':')[0].split('@')[0];
}

function isDigitQuery(query) {
  const digits = String(query || '').replace(/[^0-9]/g, '');
  return digits.length >= 10;
}

function extractQueryDigits(query) {
  return String(query || '').replace(/[^0-9]/g, '');
}

function addCandidate(mapByNumber, jid, name) {
  if (!jid || !name) return;
  const number = cleanJid(jid);
  if (!number || !number.match(/^\d+$/)) return;
  const norm = normalizeName(name);
  if (!norm || norm.match(/^\d+$/)) return; // skip pure-number "names"

  if (!mapByNumber.has(number)) mapByNumber.set(number, { jid, number, names: new Set() });
  mapByNumber.get(number).names.add(norm);
}

/**
 * Build an index of { number → { jid, number, names } } from saved contacts
 * and group participants (push names).
 */
function buildContactIndex(sock, groupMetadata) {
  const byNumber = new Map();

  const contacts = getContactsMap(sock);
  if (contacts) {
    for (const [jid, contact] of contacts.entries()) {
      if (!jid || !jid.includes('@')) continue;
      addCandidate(byNumber, jid, contact.notify);
      addCandidate(byNumber, jid, contact.name);
      addCandidate(byNumber, jid, contact.verifiedName);
    }
  }

  const participants = groupMetadata?.participants || [];
  for (const p of participants) {
    const pJid = p.id || p.jid || p.participant || '';
    addCandidate(byNumber, pJid, p.notify);
    addCandidate(byNumber, pJid, p.name);
  }

  return byNumber;
}

function isProtected(number, ownerNumbers, botNumber) {
  const botNum = cleanJid(botNumber);
  return (ownerNumbers || []).some(o => cleanJid(o) === number) || (botNum && botNum === number);
}

/**
 * Resolve a ban target.
 *
 * @param {object} opts
 * @param {object} opts.sock
 * @param {string} opts.query      raw text after the command
 * @param {string[]} opts.mentioned  @mention JIDs from contextInfo
 * @param {string|null} opts.quoted  quoted-message sender JID
 * @param {object|null} opts.groupMetadata
 * @param {string[]} opts.ownerNumbers
 * @param {string} opts.botNumber
 *
 * @returns {Promise<{status: string, number?: string, jid?: string, matches?: Array}>}
 *  status: 'number' | 'single' | 'multiple' | 'not_found' | 'protected'
 */
async function resolveBanTarget({ sock, query, mentioned = [], quoted = null, groupMetadata = null, ownerNumbers = [], botNumber = '' }) {
  const q = String(query || '').trim();

  // 1. Explicit mention or quoted message
  if (mentioned.length > 0) {
    const jid = mentioned[0];
    const number = cleanJid(jid);
    if (isProtected(number, ownerNumbers, botNumber)) return { status: 'protected' };
    return { status: 'single', jid, number, matches: [{ jid, number, name: null }] };
  }
  if (quoted) {
    const jid = quoted;
    const number = cleanJid(jid);
    if (isProtected(number, ownerNumbers, botNumber)) return { status: 'protected' };
    return { status: 'single', jid, number, matches: [{ jid, number, name: null }] };
  }

  // 2. Explicit phone number (digits, with country code)
  if (isDigitQuery(q)) {
    const number = extractQueryDigits(q);
    if (isProtected(number, ownerNumbers, botNumber)) return { status: 'protected' };
    return { status: 'number', number, jid: `${number}@s.whatsapp.net` };
  }

  // 3. Name lookup (saved contacts + group push names)
  const index = buildContactIndex(sock, groupMetadata);
  const wanted = normalizeName(q);
  if (!wanted) return { status: 'not_found' };

  const matchedNumbers = new Map(); // number → { jid, number, name }
  for (const [number, entry] of index.entries()) {
    let bestName = null;
    for (const name of entry.names) {
      if (name.includes(wanted) || wanted.includes(name)) {
        bestName = name;
        break;
      }
    }
    if (bestName && !matchedNumbers.has(number)) {
      matchedNumbers.set(number, { jid: entry.jid, number, name: bestName });
    }
  }

  if (matchedNumbers.size === 0) return { status: 'not_found' };

  const matches = Array.from(matchedNumbers.values());
  const first = matches[0];
  if (isProtected(first.number, ownerNumbers, botNumber)) return { status: 'protected' };

  if (matches.length === 1) {
    return { status: 'single', jid: first.jid, number: first.number, matches };
  }
  return { status: 'multiple', matches };
}

/**
 * Resolve a disambiguation selection from a pending .ban result.
 * Returns null when there is nothing pending or the index is out of range.
 */
function pickPendingMatch(senderJid, index) {
  const pending = pendingBans.get(senderJid);
  if (!pending) return null;
  if (Date.now() > pending.ttl) {
    pendingBans.delete(senderJid);
    return null;
  }
  const match = pending.matches[index - 1] || null;
  pendingBans.delete(senderJid);
  return match;
}

function cleanupPendingBans() {
  const now = Date.now();
  for (const [sender, pending] of pendingBans.entries()) {
    if (now > pending.ttl) pendingBans.delete(sender);
  }
}

setInterval(cleanupPendingBans, 30 * 1000);

module.exports = { resolveBanTarget, pickPendingMatch, pendingBans, normalizeName };
