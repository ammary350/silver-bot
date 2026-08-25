const database = require('../../storage/database');
const { findParticipant } = require('../../core/jid');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const HUB_SETTING = 'exclusiveAdminHub';
const menuEntries = new Map();

const getHub = () => database.getSetting(HUB_SETTING) || '';

const setHub = (jid) => database.setSetting(HUB_SETTING, jid);

const clearHub = () => database.setSetting(HUB_SETTING, '');

const isHub = (jid) => Boolean(jid && jid === getHub());

const getGroupSettings = (jid) => database.getGroupSettings(jid);

const setHidden = (jid, hidden) => database.updateGroupSettings(jid, { hidden: Boolean(hidden) });

const getTrackedGroups = async (sock) => {
  const groups = new Map();
  for (const jid of database.getConfiguredGroupIds()) {
    if (jid && jid.endsWith('@g.us')) groups.set(jid, { id: jid });
  }
  try {
    const activeGroups = await sock.groupFetchAllParticipating();
    for (const group of Object.values(activeGroups || {})) {
      if (group?.id?.endsWith('@g.us')) groups.set(group.id, group);
    }
  } catch (error) {
    console.error('[linkhub] unable to fetch active groups:', error.message);
  }
  return Array.from(groups.values());
};

const isBotAdminInMetadata = (sock, metadata) => {
  const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean);
  const participant = findParticipant(metadata?.participants || [], botIds);
  return Boolean(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));
};

const getVisibleAdminGroups = async (sock) => {
  const groups = await getTrackedGroups(sock);
  const results = await Promise.allSettled(groups.map(async group => {
    const metadata = group.participants ? group : await sock.groupMetadata(group.id);
    if (!metadata || !isBotAdminInMetadata(sock, metadata) || getGroupSettings(group.id).hidden) return null;
    return { jid: group.id, subject: metadata.subject || group.subject || group.id };
  }));
  return results.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
};

const createMenu = async (sock, jid, reply) => {
  const groups = await getVisibleAdminGroups(sock);
  if (!groups.length) return reply('لا توجد مجموعات يدير فيها البوت حالياً.');

  const text = groups.map((group, index) => `${index + 1}. ${group.subject}`).join('\n');
  const sent = await reply(`🔗 *مجموعات البوت*\n\n${text}\n\nأرسل رقماً أو نطاقاً بالرد على هذه الرسالة.`);
  if (sent?.key?.id) {
    menuEntries.set(sent.key.id, { jid, groups, expiresAt: Date.now() + 10 * 60 * 1000 });
    const timer = setTimeout(() => menuEntries.delete(sent.key.id), 10 * 60 * 1000);
    timer.unref?.();
  }
};

const parseSelection = (text, size) => {
  const value = String(text || '').trim();
  const match = value.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > size || end - start > 4) return null;
  return { start, end };
};

const sendSelectedLinks = async (sock, msg, text) => {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const stanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
  if (!quoted || !stanzaId) return false;
  const entry = menuEntries.get(stanzaId);
  if (!entry || entry.expiresAt < Date.now() || !isHub(msg.key.remoteJid)) return false;
  menuEntries.delete(stanzaId);

  const selection = parseSelection(text, entry.groups.length);
  if (!selection) return false;
  for (let index = selection.start - 1; index < selection.end; index += 1) {
    const code = await sock.groupInviteCode(entry.groups[index].jid);
    await sock.sendMessage(msg.key.remoteJid, { text: `https://chat.whatsapp.com/${code}` }, { quoted: msg });
    if (index < selection.end - 1) {
      await new Promise(resolve => setTimeout(resolve, 3000 + Math.floor(Math.random() * 2001)));
    }
  }
  return true;
};

const isHubMember = async (sock, hubJid, userJid) => {
  try {
    const metadata = await sock.groupMetadata(hubJid);
    return Boolean(findParticipant(metadata?.participants || [], userJid));
  } catch {
    return false;
  }
};

const handleParticipantUpdate = async (sock, update) => {
  const hub = getHub();
  if (!hub || !update?.id || update.id === hub || !['request', 'add'].includes(update.action)) return;
  for (const user of update.participants || []) {
    const userJid = typeof user === 'string' ? user : (user?.id || user?.jid || user?.participant || '');
    if (!userJid || !await isHubMember(sock, hub, userJid)) continue;
    try {
      if (update.action === 'request') {
        await sock.groupRequestParticipantsUpdate(update.id, [userJid], 'approve');
      }
      if (await isBotAdminInMetadata(sock, await sock.groupMetadata(update.id))) {
        await sock.groupParticipantsUpdate(update.id, [userJid], 'promote');
      }
    } catch (error) {
      console.error('[linkhub] participant update failed:', error.message);
    }
  }
};

module.exports = {
  getHub, setHub, clearHub, isHub, setHidden, createMenu, sendSelectedLinks,
  handleParticipantUpdate, getTrackedGroups
};