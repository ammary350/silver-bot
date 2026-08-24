const database = require('../../storage/database');
const { findParticipant } = require('../../core/jid');

const HUB_SETTING = 'exclusiveAdminHub';
const JOIN_APPROVAL_DELAY_MS = 5000;
const menuEntries = new Map();

const getHub = () => database.getSetting(HUB_SETTING) || '';

const setHub = (jid) => database.setSetting(HUB_SETTING, jid);

const clearHub = () => database.setSetting(HUB_SETTING, '');

const isHub = (jid) => Boolean(jid && jid === getHub());

const getGroupSettings = (jid) => database.getGroupSettings(jid);

const setHidden = (jid, hidden) => database.updateGroupSettings(jid, { hidden: Boolean(hidden) });

const getJoinedGroups = async (sock) => {
  const groups = await sock.groupFetchAllParticipating();
  return Object.values(groups || {});
};

const isBotAdminInMetadata = (sock, metadata) => {
  const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean);
  const participant = findParticipant(metadata?.participants || [], botIds);
  return Boolean(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));
};

const getVisibleAdminGroups = async (sock) => {
  const groups = await getJoinedGroups(sock);
  return groups
    .filter(group => group.id && !getGroupSettings(group.id).hidden && isBotAdminInMetadata(sock, group))
    .map(group => ({ jid: group.id, subject: group.subject || group.id }));
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
    if (!await isHubMember(sock, hub, user)) continue;
    setTimeout(async () => {
      try {
        if (update.action === 'request') {
          await sock.groupRequestParticipantsUpdate(update.id, [user], 'approve');
        }
        if (await isBotAdminInMetadata(sock, await sock.groupMetadata(update.id))) {
          await sock.groupParticipantsUpdate(update.id, [user], 'promote');
        }
      } catch (error) {
        console.error('[linkhub] participant update failed:', error.message);
      }
    }, JOIN_APPROVAL_DELAY_MS);
  }
};

module.exports = {
  getHub, setHub, clearHub, isHub, setHidden, createMenu, sendSelectedLinks,
  handleParticipantUpdate
};