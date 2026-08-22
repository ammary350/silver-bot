const fs = require('fs');
const path = require('path');
const config = require('../config');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const OLD_DB_PATH = path.join(PROJECT_ROOT, 'database');
const DB_PATH = path.join(PROJECT_ROOT, 'data');

// Migrate from old database/ to new data/ if needed
if (fs.existsSync(OLD_DB_PATH) && !fs.existsSync(DB_PATH)) {
  try {
    fs.renameSync(OLD_DB_PATH, DB_PATH);
    console.log('📂 Migrated database/ to data/');
  } catch (e) {
    console.error('⚠️ Could not migrate database/ to data/:', e.message);
  }
}

const GROUPS_DB = path.join(DB_PATH, 'groups.json');
const USERS_DB = path.join(DB_PATH, 'users.json');
const WARNINGS_DB = path.join(DB_PATH, 'warnings.json');
const COOWNS_DB = path.join(DB_PATH, 'coowners.json');
const BOTADMINS_DB = path.join(DB_PATH, 'botadmins.json');
const SETTINGS_DB = path.join(DB_PATH, 'settings.json');
const RECIPIENTS_DB = path.join(DB_PATH, 'recipients.json');
const ANTIWORD_DB = path.join(DB_PATH, 'antiword.json');
const AUTOCHAT_DB = path.join(DB_PATH, 'autochat.json');

if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(DB_PATH, { recursive: true });
}

const initDB = (filePath, defaultData = {}) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
};

initDB(GROUPS_DB, {});
initDB(USERS_DB, {});
initDB(WARNINGS_DB, {});
initDB(COOWNS_DB, { coowners: [] });
initDB(BOTADMINS_DB, { admins: [] });
initDB(SETTINGS_DB, { botNumber: '', botName: 'Silver Bot' });
initDB(RECIPIENTS_DB, { recipients: [] });
initDB(ANTIWORD_DB, {});
initDB(AUTOCHAT_DB, { enabled: false, time: '22:00', lastReportDate: '' });

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 3000;

const cacheGet = (key) => {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return undefined;
};

const cacheSet = (key, data) => {
  cache.set(key, { data, ts: Date.now() });
};

const cacheDel = (key) => {
  cache.delete(key);
};

const readDB = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
};

const writeDB = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    return false;
  }
};

// Cache-aware file reads for hot paths
const readDBCached = (filePath) => {
  const cached = cacheGet(filePath);
  if (cached !== undefined) return cached;
  const data = readDB(filePath);
  cacheSet(filePath, data);
  return data;
};

const writeDBAndCache = (filePath, data) => {
  const ok = writeDB(filePath, data);
  if (ok) cacheSet(filePath, data);
  return ok;
};

// ============================================================
// GROUP SETTINGS (existing + extended)
// ============================================================
const getGroupSettings = (groupId) => {
  const groups = readDBCached(GROUPS_DB);
  if (!groups[groupId]) {
    groups[groupId] = { ...config.defaultGroupSettings };
    cacheDel(GROUPS_DB);
    writeDB(GROUPS_DB, groups);
  }
  return groups[groupId];
};

const updateGroupSettings = (groupId, settings) => {
  const groups = readDBCached(GROUPS_DB);
  groups[groupId] = { ...groups[groupId], ...settings };
  cacheDel(GROUPS_DB);
  return writeDBAndCache(GROUPS_DB, groups);
};

// ============================================================
// USER DATA
// ============================================================
const getUser = (userId) => {
  const users = readDBCached(USERS_DB);
  if (!users[userId]) {
    users[userId] = { registered: Date.now(), premium: false, banned: false };
    cacheDel(USERS_DB);
    writeDB(USERS_DB, users);
  }
  return users[userId];
};

const updateUser = (userId, data) => {
  const users = readDBCached(USERS_DB);
  users[userId] = { ...users[userId], ...data };
  cacheDel(USERS_DB);
  return writeDBAndCache(USERS_DB, users);
};

// ============================================================
// WARNINGS SYSTEM
// ============================================================
const getWarnings = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  return warnings[key] || { count: 0, warnings: [] };
};

const addWarning = (groupId, userId, reason) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  if (!warnings[key]) {
    warnings[key] = { count: 0, warnings: [] };
  }
  warnings[key].count++;
  warnings[key].warnings.push({ reason, date: Date.now() });
  writeDB(WARNINGS_DB, warnings);
  return warnings[key];
};

const removeWarning = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  if (warnings[key] && warnings[key].count > 0) {
    warnings[key].count--;
    warnings[key].warnings.pop();
    writeDB(WARNINGS_DB, warnings);
    return true;
  }
  return false;
};

const clearWarnings = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  delete warnings[key];
  return writeDB(WARNINGS_DB, warnings);
};

// ============================================================
// BOT-APPROVED ADMINS SYSTEM
// ============================================================
const getBotAdmins = () => {
  const data = readDBCached(BOTADMINS_DB);
  return data.admins || [];
};

const addBotAdmin = (userId) => {
  const data = readDBCached(BOTADMINS_DB);
  if (!data.admins) data.admins = [];
  if (!data.admins.includes(userId)) {
    data.admins.push(userId);
    cacheDel(BOTADMINS_DB);
    return writeDBAndCache(BOTADMINS_DB, data);
  }
  return false;
};

const removeBotAdmin = (userId) => {
  const data = readDBCached(BOTADMINS_DB);
  if (data.admins) {
    data.admins = data.admins.filter(id => id !== userId);
    cacheDel(BOTADMINS_DB);
    return writeDBAndCache(BOTADMINS_DB, data);
  }
  return false;
};

const isBotAdminApproved = (userId) => {
  const data = readDBCached(BOTADMINS_DB);
  return data.admins && data.admins.includes(userId);
};

// ============================================================
// CO-OWNERS SYSTEM
// ============================================================
const getCoOwners = () => {
  const data = readDBCached(COOWNS_DB);
  return data.coowners || [];
};

const addCoOwner = (userId) => {
  const data = readDBCached(COOWNS_DB);
  if (!data.coowners) data.coowners = [];
  if (!data.coowners.includes(userId)) {
    data.coowners.push(userId);
    cacheDel(COOWNS_DB);
    return writeDBAndCache(COOWNS_DB, data);
  }
  return false;
};

const removeCoOwner = (userId) => {
  const data = readDBCached(COOWNS_DB);
  if (data.coowners) {
    data.coowners = data.coowners.filter(id => id !== userId);
    cacheDel(COOWNS_DB);
    return writeDBAndCache(COOWNS_DB, data);
  }
  return false;
};

const isCoOwner = (userId) => {
  const data = readDBCached(COOWNS_DB);
  return data.coowners && data.coowners.includes(userId);
};

// ============================================================
// BOT NUMBER SETTINGS
// ============================================================
const getBotNumber = () => {
  const data = readDBCached(SETTINGS_DB);
  return data.botNumber || '';
};

const setBotNumber = (number) => {
  const data = readDBCached(SETTINGS_DB);
  data.botNumber = number;
  cacheDel(SETTINGS_DB);
  return writeDBAndCache(SETTINGS_DB, data);
};

// Generic runtime settings (set via owner commands, persisted in settings.json)
const getSetting = (key) => {
  const data = readDBCached(SETTINGS_DB);
  return data[key];
};

const setSetting = (key, value) => {
  const data = readDBCached(SETTINGS_DB);
  data[key] = value;
  cacheDel(SETTINGS_DB);
  return writeDBAndCache(SETTINGS_DB, data);
};

// ============================================================
// CHAT STATS RECIPIENTS
// ============================================================
const getRecipients = () => {
  const data = readDB(RECIPIENTS_DB);
  return data.recipients || [];
};

const addRecipient = (userId) => {
  const data = readDB(RECIPIENTS_DB);
  if (!data.recipients) data.recipients = [];
  if (!data.recipients.includes(userId)) {
    data.recipients.push(userId);
    return writeDB(RECIPIENTS_DB, data);
  }
  return false;
};

const removeRecipient = (userId) => {
  const data = readDB(RECIPIENTS_DB);
  if (data.recipients) {
    data.recipients = data.recipients.filter(id => id !== userId);
    return writeDB(RECIPIENTS_DB, data);
  }
  return false;
};

// ============================================================
// ANTI-WORD LISTS (per-group)
// ============================================================
const getAntiWords = (groupId) => {
  const data = readDBCached(ANTIWORD_DB);
  return data[groupId] || [];
};

const addAntiWord = (groupId, word) => {
  const data = readDBCached(ANTIWORD_DB);
  if (!data[groupId]) data[groupId] = [];
  if (!data[groupId].includes(word.toLowerCase())) {
    data[groupId].push(word.toLowerCase());
    cacheDel(ANTIWORD_DB);
    return writeDBAndCache(ANTIWORD_DB, data);
  }
  return false;
};

const removeAntiWord = (groupId, word) => {
  const data = readDBCached(ANTIWORD_DB);
  if (data[groupId]) {
    data[groupId] = data[groupId].filter(w => w !== word.toLowerCase());
    cacheDel(ANTIWORD_DB);
    return writeDBAndCache(ANTIWORD_DB, data);
  }
  return false;
};

// ============================================================
// AUTOCHAT CONFIGURATION
// ============================================================
const getAutochatConfig = () => {
  return readDBCached(AUTOCHAT_DB);
};

const setAutochatConfig = (updates) => {
  const data = readDBCached(AUTOCHAT_DB);
  Object.assign(data, updates);
  cacheDel(AUTOCHAT_DB);
  return writeDBAndCache(AUTOCHAT_DB, data);
};

// ============================================================
// GLOBAL BLOCKED NUMBERS — structured JSON blocklist
// ============================================================
const BLOCKLIST_DB = path.join(DB_PATH, 'blocklist.json');

// Auto-migrate from old text file if present
const OLD_BLOCKED_TXT = path.join(DB_PATH, 'blocked-numbers.txt');
if (fs.existsSync(OLD_BLOCKED_TXT) && !fs.existsSync(BLOCKLIST_DB)) {
  try {
    const raw = fs.readFileSync(OLD_BLOCKED_TXT, 'utf8').trim();
    const numbers = raw ? raw.split('\n').map(l => l.trim()).filter(Boolean) : [];
    const entries = numbers.map(n => ({
      number: n,
      reason: 'migrated',
      date: new Date().toISOString(),
      action: 'block'
    }));
    fs.writeFileSync(BLOCKLIST_DB, JSON.stringify(entries, null, 2), 'utf8');
    console.log(`📂 Migrated ${entries.length} entries from blocked-numbers.txt to blocklist.json`);
  } catch (e) {
    console.error('⚠️ Could not migrate blocked-numbers.txt:', e.message);
  }
}

// Auto-migrate from old JSON file if present
const OLD_BLOCKED_JSON = path.join(DB_PATH, 'blockedNumbers.json');
if (fs.existsSync(OLD_BLOCKED_JSON) && !fs.existsSync(BLOCKLIST_DB)) {
  try {
    const oldData = JSON.parse(fs.readFileSync(OLD_BLOCKED_JSON, 'utf8'));
    const entries = Object.entries(oldData)
      .filter(([_, v]) => v && typeof v === 'object')
      .map(([num]) => ({
        number: num,
        reason: 'migrated',
        date: new Date().toISOString(),
        action: 'block'
      }));
    if (entries.length > 0) {
      fs.writeFileSync(BLOCKLIST_DB, JSON.stringify(entries, null, 2), 'utf8');
      console.log(`📂 Migrated ${entries.length} entries from blockedNumbers.json to blocklist.json`);
    }
  } catch (e) {
    console.error('⚠️ Could not migrate old blockedNumbers.json:', e.message);
  }
}

if (!fs.existsSync(BLOCKLIST_DB)) {
  fs.writeFileSync(BLOCKLIST_DB, '[]', 'utf8');
}

const normalizeNumber = (num) => {
  if (!num) return '';
  return num.replace(/[^0-9]/g, '');
};

const formatNumber = (num) => {
  if (!num) return '';
  const digits = normalizeNumber(num);
  if (digits.length <= 3) return digits;
  const cc = digits.slice(0, digits.length <= 10 ? 1 : digits.length - 9);
  const rest = digits.slice(cc.length);
  const groups = [];
  for (let i = 0; i < rest.length; i += 3) {
    groups.push(rest.slice(i, i + 3));
  }
  return `+${cc} ${groups.join(' ')}`;
};

const readBlocklist = () => {
  try {
    const raw = fs.readFileSync(BLOCKLIST_DB, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const writeBlocklist = (entries) => {
  try {
    fs.writeFileSync(BLOCKLIST_DB, JSON.stringify(entries, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
};

// Check if a number is in the blocklist
const isNumberBlocked = (number) => {
  const normalized = normalizeNumber(number);
  if (!normalized) return false;
  const entries = readBlocklist();
  return entries.some(e => normalizeNumber(e.number) === normalized);
};

// Add a simple blocked number (backward compatible)
const addBlockedNumber = (number) => {
  const normalized = normalizeNumber(number);
  if (!normalized) return { success: false, error: 'invalid number' };
  const entries = readBlocklist();
  if (entries.some(e => normalizeNumber(e.number) === normalized)) {
    return { success: false, error: 'already blocked' };
  }
  entries.push({
    number: normalized,
    jid: '',
    reason: 'manual',
    date: new Date().toISOString(),
    groupId: '',
    groupName: '',
    action: 'block'
  });
  writeBlocklist(entries);
  return { success: true };
};

// Add a rich blocked entry with full metadata
const addBlockedEntry = ({ jid, number, reason, groupId, groupName, action }) => {
  const normalized = normalizeNumber(number || jid);
  if (!normalized) return { success: false, error: 'invalid number' };
  const entries = readBlocklist();
  if (entries.some(e => normalizeNumber(e.number) === normalized)) {
    return { success: false, error: 'already blocked' };
  }
  const entry = {
    jid: jid || '',
    number: normalized,
    reason: reason || 'manual',
    date: new Date().toISOString(),
    groupId: groupId || '',
    groupName: groupName || '',
    action: action || 'block'
  };
  entries.push(entry);
  writeBlocklist(entries);
  return { success: true, entry };
};

const removeBlockedNumber = (number) => {
  const normalized = normalizeNumber(number);
  if (!normalized) return { success: false, error: 'invalid number' };
  let entries = readBlocklist();
  const before = entries.length;
  entries = entries.filter(e => normalizeNumber(e.number) !== normalized);
  if (entries.length === before) return { success: false, error: 'not found' };
  writeBlocklist(entries);
  return { success: true };
};

// Return all blocked entries as array
const getBlockedNumbers = () => {
  const entries = readBlocklist();
  const obj = {};
  for (const e of entries) {
    obj[e.number] = { number: e.number, reason: e.reason, date: e.date, action: e.action };
  }
  return obj;
};

// Return rich blocklist array (for blocklist command)
const getRichBlocklist = () => {
  return readBlocklist();
};

// Get a single blocked entry by number
const getBlockedEntry = (number) => {
  const normalized = normalizeNumber(number);
  if (!normalized) return null;
  const entries = readBlocklist();
  return entries.find(e => normalizeNumber(e.number) === normalized) || null;
};

// ============================================================
// GROUP APPROVAL MESSAGE
// ============================================================
const getApprovalMessage = (groupId) => {
  const groups = readDBCached(GROUPS_DB);
  if (!groups[groupId]) {
    groups[groupId] = { ...config.defaultGroupSettings };
    cacheDel(GROUPS_DB);
    writeDB(GROUPS_DB, groups);
  }
  return groups[groupId].approvalMessage || '';
};

const setApprovalMessage = (groupId, message) => {
  const groups = readDBCached(GROUPS_DB);
  if (!groups[groupId]) {
    groups[groupId] = { ...config.defaultGroupSettings };
  }
  groups[groupId].approvalMessage = message;
  cacheDel(GROUPS_DB);
  return writeDBAndCache(GROUPS_DB, groups);
};

module.exports = {
  getGroupSettings,
  updateGroupSettings,
  getApprovalMessage,
  setApprovalMessage,
  getUser,
  updateUser,
  getWarnings,
  addWarning,
  removeWarning,
  clearWarnings,
  getCoOwners,
  addCoOwner,
  removeCoOwner,
  isCoOwner,
  getBotAdmins,
  addBotAdmin,
  removeBotAdmin,
  isBotAdminApproved,
  getBotNumber,
  setBotNumber,
  getSetting,
  setSetting,
  getRecipients,
  addRecipient,
  removeRecipient,
  getAntiWords,
  addAntiWord,
  removeAntiWord,
  getAutochatConfig,
  setAutochatConfig,
  getBlockedNumbers,
  addBlockedNumber,
  addBlockedEntry,
  removeBlockedNumber,
  isNumberBlocked,
  getBlockedEntry,
  getRichBlocklist,
  normalizeNumber,
  formatNumber
};