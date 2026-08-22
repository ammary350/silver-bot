const path = require('path');
const fs = require('fs');
const config = require('../config');
const { jidDecode, jidEncode } = require('@whiskeysockets/baileys');

const lidMappingCache = new Map();

const normalizeJid = (jid) => {
  if (!jid || typeof jid !== 'string') return null;
  if (jid.includes(':')) return jid.split(':')[0];
  if (jid.includes('@')) return jid.split('@')[0];
  return jid;
};

const getLidMappingValue = (user, direction) => {
  if (!user) return null;
  const cacheKey = `${direction}:${user}`;
  if (lidMappingCache.has(cacheKey)) return lidMappingCache.get(cacheKey);
  const sessionPath = path.join(__dirname, '..', '..', config.sessionName || 'session');
  const suffix = direction === 'pnToLid' ? '.json' : '_reverse.json';
  const filePath = path.join(sessionPath, `lid-mapping-${user}${suffix}`);
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const value = raw ? JSON.parse(raw) : null;
    lidMappingCache.set(cacheKey, value || null);
    return value || null;
  } catch {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
};

const normalizeJidWithLid = (jid) => {
  if (!jid) return jid;
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) return `${jid.split(':')[0].split('@')[0]}@s.whatsapp.net`;
    let user = decoded.user;
    let server = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    if (server === 'lid' || server === 'hosted.lid') {
      const pnUser = getLidMappingValue(user, 'lidToPn');
      if (pnUser) { user = pnUser; server = 's.whatsapp.net'; }
    } else if (server === 's.whatsapp.net' || server === 'hosted') {
      const pnUser = getLidMappingValue(user, 'lidToPn');
      if (pnUser) { user = pnUser; server = server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net'; }
    }
    return jidEncode(user, server === 'hosted' ? 'hosted' : 's.whatsapp.net');
  } catch { return jid; }
};

const buildComparableIds = (jid) => {
  if (!jid) return [];
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) return [normalizeJidWithLid(jid)].filter(Boolean);
    const variants = new Set();
    const normalizedServer = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    variants.add(jidEncode(decoded.user, normalizedServer));
    const isPnServer = normalizedServer === 's.whatsapp.net' || normalizedServer === 'hosted';
    const isLidServer = normalizedServer === 'lid' || normalizedServer === 'hosted.lid';
    if (isPnServer) {
      const lidUser = getLidMappingValue(decoded.user, 'pnToLid');
      if (lidUser) variants.add(jidEncode(lidUser, normalizedServer === 'hosted' ? 'hosted.lid' : 'lid'));
    } else if (isLidServer) {
      const pnUser = getLidMappingValue(decoded.user, 'lidToPn');
      if (pnUser) variants.add(jidEncode(pnUser, normalizedServer === 'hosted.lid' ? 'hosted' : 's.whatsapp.net'));
    }
    return Array.from(variants);
  } catch { return [jid]; }
};

const findParticipant = (participants, userIds) => {
  if (!participants || !Array.isArray(participants)) return null;
  const targets = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .flatMap(id => buildComparableIds(id));
  if (!targets.length) return null;
  return participants.find(participant => {
    if (!participant) return false;
    const participantIds = [participant.id, participant.lid, participant.userJid]
      .filter(Boolean)
      .flatMap(id => buildComparableIds(id));
    return participantIds.some(id => targets.includes(id));
  }) || null;
};

const stripDevice = (jid) => {
  if (!jid || typeof jid !== 'string') return '';
  return jid.split(':')[0].split('@')[0];
};

module.exports = {
  normalizeJid,
  normalizeJidWithLid,
  buildComparableIds,
  getLidMappingValue,
  findParticipant,
  stripDevice,
  lidMappingCache
};
