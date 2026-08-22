/**
 * Block Control group — automatic phone-number blocklisting.
 * The Owner selects a group (via `.blockctrl set`); every message received
 * in that exact group is scanned for phone numbers. Detected numbers are
 * normalized to canonical international format, validated against the
 * configured country rules, and added to the persistent blocklist.
 * Enforcement reuses the existing ban pipeline (enforcer.js) with a random
 * 3-4s delay. Anti-account / contact-card violations keep their immediate
 * path in handlers/protections.js.
 */

const database = require('../../storage/database');
const config = require('../../config');
const { enforceSingleBan } = require('../bans/enforcer');

const BLOCK_CONTROL_KEY = 'blockControlGroup';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const MIN_DELAY_MS = 3000;
const MAX_DELAY_MS = 4000;

// Convert Arabic-Indic and Persian digits to Latin digits
const toLatinDigits = (text) => String(text)
  .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
  .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));

// Runs of digits and separators; a leading '+' marks an international number
const TOKEN_RE = /\+?\d[\d\s\-–—(){}[\].,]*\d|\d+/g;

/**
 * Detect phone numbers inside arbitrary text.
 * Numbers may be surrounded by words, symbols, emojis, punctuation or spaces.
 * Dates, IDs, group JIDs and ordinary long numbers are rejected.
 * @returns {string[]} canonical international numbers (digits, incl. country code)
 */
function detectNumbers(text, rules) {
  if (!text || typeof text !== 'string') return [];
  const cc = String((rules && rules.cc) || '').replace(/[^0-9]/g, '');
  const latin = toLatinDigits(text);
  const found = [];
  let match;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(latin)) !== null) {
    const raw = match[0];
    const hasPlus = raw.startsWith('+');
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length < 7 || digits.length > 15) continue;
    if (/^(\d)\1{5,}$/.test(digits)) continue; // placeholder / repeated digit

    let canonical = null;
    if (hasPlus) {
      canonical = digits; // explicit international prefix
    } else if (digits.startsWith('00') && digits.length > 2) {
      const body = digits.slice(2);
      if (body.length >= 7 && body.length <= 15) canonical = body;
    } else if (cc) {
      if (digits.startsWith(cc) && digits.length >= cc.length + 6 && digits.length <= cc.length + 9) {
        canonical = digits; // already international
      } else if (digits.length >= 9 && digits.length <= 10) {
        const local = digits.startsWith('0') ? digits.slice(1) : digits; // local format
        if (local.length >= 8 && local.length <= 9) canonical = cc + local;
      }
    } else if (digits.length >= 10 && digits.length <= 13) {
      canonical = digits; // no rules: only accept clearly-international length
    }

    if (canonical && !found.includes(canonical)) found.push(canonical);
  }
  return found;
}

const getBlockControlGroup = () => database.getSetting(BLOCK_CONTROL_KEY) || '';

const setBlockControlGroup = (groupId) => database.setSetting(BLOCK_CONTROL_KEY, groupId);

const clearBlockControlGroup = () => database.setSetting(BLOCK_CONTROL_KEY, '');

// Unwrap WhatsApp containers (ephemeral, view once, document-with-caption)
const unwrap = (msg) => {
  if (!msg || !msg.message) return null;
  let m = msg.message;
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  return m;
};

const pushText = (out, t) => {
  if (t && typeof t === 'string' && t.trim()) out.push(t);
};

// Collect every text-bearing field: normal text, extended text, quoted text, captions
const extractTexts = (content) => {
  const out = [];
  if (content.conversation) pushText(out, content.conversation);
  if (content.extendedTextMessage) {
    pushText(out, content.extendedTextMessage.text);
    const quoted = content.extendedTextMessage.contextInfo && content.extendedTextMessage.contextInfo.quotedMessage;
    if (quoted) {
      if (quoted.conversation) pushText(out, quoted.conversation);
      if (quoted.extendedTextMessage) pushText(out, quoted.extendedTextMessage.text);
      if (quoted.imageMessage) pushText(out, quoted.imageMessage.caption);
      if (quoted.videoMessage) pushText(out, quoted.videoMessage.caption);
      if (quoted.documentMessage) pushText(out, quoted.documentMessage.caption);
    }
  }
  if (content.imageMessage) pushText(out, content.imageMessage.caption);
  if (content.videoMessage) pushText(out, content.videoMessage.caption);
  if (content.documentMessage) pushText(out, content.documentMessage.caption);
  return out;
};

/**
 * Scan one incoming message in the Block Control group.
 * Adds detected numbers to the persistent blocklist and schedules
 * enforcement with a random 3-4s delay. Never announces the number publicly.
 */
async function handleBlockControlMessage(sock, msg) {
  const controlGroup = getBlockControlGroup();
  if (!controlGroup) return;
  const from = msg && msg.key && msg.key.remoteJid;
  if (!from || from !== controlGroup) return;
  if (msg.key.fromMe) return; // never scan the bot's own messages

  const content = unwrap(msg);
  if (!content) return;
  const texts = extractTexts(content);
  if (!texts.length) return;

  const rules = { cc: config.blockControlCountryCode || '' };
  const numbers = [];
  for (const t of texts) {
    for (const n of detectNumbers(t, rules)) {
      if (!numbers.includes(n)) numbers.push(n);
    }
  }
  if (!numbers.length) return;

  const botNum = database.normalizeNumber(database.getBotNumber());
  const owners = (Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber])
    .map(database.normalizeNumber)
    .filter(Boolean);

  for (const num of numbers) {
    if (botNum && num === botNum) continue; // never block the bot itself
    if (owners.includes(num)) continue; // never block protected owners

    const entry = database.addBlockedEntry({
      jid: `${num}@s.whatsapp.net`,
      number: num,
      reason: 'blockctrl',
      date: new Date().toISOString(),
      groupId: from,
      groupName: '',
      action: 'block'
    });
    if (!entry || !entry.success) continue; // duplicate or invalid — ignore

    // Normal detections: random 3-4s delay before enforcement
    const delay = MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
    setTimeout(() => {
      enforceSingleBan(sock, { jid: `${num}@s.whatsapp.net`, number: num, reason: 'blockctrl', action: 'block' }, null)
        .catch(() => {});
    }, delay);

    console.log(`[blockctrl] Number ***${String(num).slice(-3)} blocklisted (control group)`);
  }
}

module.exports = {
  BLOCK_CONTROL_KEY,
  detectNumbers,
  getBlockControlGroup,
  setBlockControlGroup,
  clearBlockControlGroup,
  handleBlockControlMessage
};