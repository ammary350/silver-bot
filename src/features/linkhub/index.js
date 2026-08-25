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
  const botNumber = String(sock.user?.id || '').split(':')[0].replace(/\D/g, '');
  if (!botNumber) return false;
  return (metadata?.participants || []).some(p =>
    String(p.id || '').startsWith(botNumber) &&
    (p.admin === 'admin' || p.admin === 'superadmin')
  );
};

const createMenu = async (sock, jid, reply) => {
  const groups = [];
  for (const group of await getTrackedGroups(sock)) {
    try {
      const metadata = group.participants ? group : await sock.groupMetadata(group.id);
      const groupName = metadata?.subject || group.subject || group.id;
      groups.push({ jid: group.id, subject: groupName, isAdmin: Boolean(metadata && isBotAdminInMetadata(sock, metadata)) });
    } catch (error) {
      console.error('[linkhub] unable to fetch group metadata:', error.message);
    }
  }

  if (!groups.length) return reply('لا توجد مجموعات مسجلة.');
  const text = groups
    .map((group, index) => `${index + 1}. ${group.subject}${group.isAdmin ? '' : ' ❌ (Needs Admin)'}`)
    .join('\n');
  const sent = await reply(`🔗 *مجموعات البوت*\n\n${text}\n\nأرسل رقم المجموعة المطلوبة.`);
  if (sent?.key?.id) {
    menuEntries.set(sent.key.id, { jid, groups, expiresAt: Date.now() + 10 * 60 * 1000 });
    const timer = setTimeout(() => menuEntries.delete(sent.key.id), 10 * 60 * 1000);
    timer.unref?.();
  }
};

const parseSelection = (text, size) => {
  const value = String(text || '').trim();
  const match = value.match(/^(\d+)$/);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 && index < size ? index : null;
};

const sendSelectedLinks = async (sock, msg, text) => {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const stanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
  if (!quoted || !stanzaId) return false;
  const entry = menuEntries.get(stanzaId);
  if (!entry || entry.expiresAt < Date.now() || !isHub(msg.key.remoteJid)) return false;
  menuEntries.delete(stanzaId);

  const selectedIndex = parseSelection(text, entry.groups.length);
  if (selectedIndex === null) return false;

  const selectedGroup = entry.groups[selectedIndex];
  let metadata;
  try {
    metadata = await sock.groupMetadata(selectedGroup.jid);
  } catch (error) {
    console.error('[linkhub] unable to refresh group metadata:', error.message);
    await sock.sendMessage(msg.key.remoteJid, { text: '❌ تعذر التحقق من صلاحيات البوت في هذه المجموعة.' }, { quoted: msg });
    return true;
  }

  if (!isBotAdminInMetadata(sock, metadata)) {
    await sock.sendMessage(msg.key.remoteJid, { text: '❌ عذراً، البوت ليس مشرفاً في هذه المجموعة ولا يمكنه جلب الرابط.' }, { quoted: msg });
    return true;
  }

  try {
    const code = await sock.groupInviteCode(selectedGroup.jid);
    await sock.sendMessage(msg.key.remoteJid, { text: `https://chat.whatsapp.com/${code}` }, { quoted: msg });
  } catch (error) {
    console.error('[linkhub] unable to fetch group link:', error.message);
    await sock.sendMessage(msg.key.remoteJid, { text: '❌ تعذر جلب رابط هذه المجموعة حالياً.' }, { quoted: msg });
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