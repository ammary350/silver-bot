/**
 * Handlers index — legacy-compatible API surface.
 * The root ./handler.js re-exports this so existing commands keep working.
 */

const { handleMessage, getMessageContent, isSystemJid } = require('./messageHandler');
const { handleGroupUpdate } = require('./groupHandler');
const {
  handleAntilink,
  handleAntiSpam,
  handleAntiWord,
  handlePromotionDetection,
  handleAntiAcc,
  handleMessageUpdate,
  promotionLogs
} = require('./protections');
const { initializeAntiCall } = require('./callHandler');
const perm = require('../core/permissions');
const { isAdmin, isBotAdmin, getGroupMetadata } = require('../features/groups/metadata');

module.exports = {
  handleMessage,
  handleGroupUpdate,
  handleAntilink,
  handleAntiSpam,
  handleAntiWord,
  handlePromotionDetection,
  handleAntiAcc,
  handleMessageUpdate,
  initializeAntiCall,
  promotionLogs,
  isOwner: perm.isOwner,
  isBotUser: perm.isBotUser,
  isCoOwner: perm.isCoOwner,
  isBotAdminApproved: perm.isBotAdminApproved,
  isTrusted: perm.isTrusted,
  hasRole: perm.hasRole,
  isAdmin,
  isBotAdmin,
  getGroupMetadata,
  getMessageContent,
  isSystemJid
};
