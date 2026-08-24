const config = require('../config');
const database = require('../storage/database');
const jid = require('./jid');

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

const isOwner = (sender) => {
  if (!sender) return false;
  const configuredOwners = Array.isArray(global.owner) && global.owner.length
    ? global.owner
    : (Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber]);
  const senderIds = [sender, ...jid.buildComparableIds(sender)];
  const senderNumbers = new Set(senderIds.map(digitsOnly).filter(Boolean));
  return configuredOwners
    .map(digitsOnly)
    .filter(Boolean)
    .some(ownerNumber => senderNumbers.has(ownerNumber));
};

const isBotUser = (sender) => {
  if (!sender) return false;
  const variants = jid.buildComparableIds(sender);
  const senderNums = variants.map(v => jid.stripDevice(v)).filter(Boolean);
  const stored = database.getBotNumber();
  if (!stored) return false;
  const storedNum = jid.stripDevice(stored);
  return senderNums.includes(storedNum);
};

const isCoOwner = (sender) => {
  if (!sender) return false;
  if (isOwner(sender)) return true;
  const variants = jid.buildComparableIds(sender);
  const senderNums = variants.map(v => jid.stripDevice(v)).filter(Boolean);
  const coowners = database.getCoOwners();
  return coowners.some(co => {
    const coNum = jid.stripDevice(co);
    return senderNums.includes(coNum);
  });
};

const isBotAdminApproved = (sender) => {
  if (!sender) return false;
  const variants = jid.buildComparableIds(sender);
  const senderNums = variants.map(v => jid.stripDevice(v)).filter(Boolean);
  const admins = database.getBotAdmins();
  return admins.some(adm => {
    const admNum = jid.stripDevice(adm);
    return senderNums.includes(admNum);
  });
};

const isTrusted = (sender) => {
  return isOwner(sender) || isBotUser(sender) || isCoOwner(sender);
};

const hasRole = (sender) => {
  return isOwner(sender) || isBotUser(sender) || isCoOwner(sender) || isBotAdminApproved(sender);
};

const canManageCoOwners = (sender) => {
  return isOwner(sender);
};

const canManageAdmins = (sender) => {
  return isOwner(sender) || isCoOwner(sender);
};

const getRole = (sender) => {
  if (isOwner(sender)) return 'owner';
  if (isBotUser(sender)) return 'bot_user';
  if (isCoOwner(sender)) return 'co_owner';
  if (isBotAdminApproved(sender)) return 'bot_admin';
  return 'none';
};

const getDenialMessage = (sender) => {
  const role = getRole(sender);
  if (role === 'co_owner') return '❌ This action is reserved for the main Owner only.';
  if (role === 'bot_admin') return '❌ Admin role is limited to moderation commands.';
  return '❌ You are not authorized to use this command.';
};

const isGroupAdmin = async (sock, sender, groupId, groupMetadata) => {
  if (!sender || !groupId) return false;
  if (isOwner(sender) || isCoOwner(sender)) return true;
  const metadata = require('../features/groups/metadata');
  return metadata.isAdmin(sock, sender, groupId, groupMetadata);
};

const isBotGroupAdmin = async (sock, groupId, groupMetadata) => {
  if (!sock || !groupId) return false;
  const metadata = require('../features/groups/metadata');
  return metadata.isBotAdmin(sock, groupId, groupMetadata);
};

module.exports = {
  isOwner,
  isBotUser,
  isCoOwner,
  isBotAdminApproved,
  isTrusted,
  hasRole,
  canManageCoOwners,
  canManageAdmins,
  getRole,
  getDenialMessage,
  isGroupAdmin,
  isBotGroupAdmin
};
