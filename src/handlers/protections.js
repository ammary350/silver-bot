/**
 * Protection handlers — antilink, antispam, antiword,
 * promotion detection, strict vCard policy (handleAntiAcc), antidelete.
 * Moved from the old monolithic handler.js.
 */

const config = require('../config');
const database = require('../storage/database');
const perm = require('../core/permissions');
const { findParticipant } = require('../core/jid');
const { getGroupMetadata, isAdmin, isBotAdmin } = require('../features/groups/metadata');

// Anti-spam tracking
const spamTracker = new Map();
// Anti-spam lock timers per group
const spamLocks = new Map();
// Promotion log cache
const promotionLogs = new Map();
// Contact-card anti-spam dedupe — short TTL lock keyed by message id
const vCardProcessed = new Map();
const VCARD_LOCK_TTL_MS = 60000;

// Mask numbers in logs (last 3 digits only)
const maskNumber = (value) => {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits ? `***${digits.slice(-3)}` : '***';
};

const isUrl = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return urlRegex.test(text);
};

const hasGroupLink = (text) => {
  const linkRegex = /chat.whatsapp.com\/([0-9A-Za-z]{20,24})/i;
  return linkRegex.test(text);
};

// Antilink handler
const handleAntilink = async (sock, msg, groupMetadata) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antilink) return;
    if (groupSettings.mute) return; // Skip antilink enforcement in muted groups

    const body = msg.message?.conversation ||
                  msg.message?.extendedTextMessage?.text ||
                  msg.message?.imageMessage?.caption ||
                  msg.message?.videoMessage?.caption || '';

    // Comprehensive link detection - matches links with or without protocols
    // Matches: https://t.me/..., http://wa.me/..., t.me/..., wa.me/..., google.com, telegram.com, etc.
    // Pattern breakdown:
    // 1. (https?:\/\/)? - Optional http:// or https://
    // 2. ([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,} - Domain pattern (e.g., google.com, t.me)
    // 3. (\/[^\s]*)? - Optional path after domain
    const linkPattern = /(https?:\/\/)?([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i;

    // Check for any links (with or without protocol)
    if (linkPattern.test(body)) {
      const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
      const senderIsOwner = perm.isOwner(sender);

      if (senderIsAdmin || senderIsOwner) return;

      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      const action = (groupSettings.antilinkAction || 'delete').toLowerCase();

      if (action === 'kick' && botIsAdmin) {
        try {
          await sock.sendMessage(from, { delete: msg.key });
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
          await sock.sendMessage(from, {
            text: `🔗 Anti-link triggered. Link removed.`,
            mentions: [sender]
          }, { quoted: msg });
        } catch (e) {
          console.error('Failed to kick for antilink:', e);
        }
      } else {
        // Default: delete message
        try {
          await sock.sendMessage(from, { delete: msg.key });
          await sock.sendMessage(from, {
            text: `🔗 Anti-link triggered. Link removed.`,
            mentions: [sender]
          }, { quoted: msg });
        } catch (e) {
          console.error('Failed to delete message for antilink:', e);
        }
      }
    }
  } catch (error) {
    console.error('Error in antilink handler:', error);
  }
};

// Anti-spam handler
const handleAntiSpam = async (sock, msg, from, sender, groupMetadata) => {
  const now = Date.now();
  if (!spamTracker.has(from)) {
    spamTracker.set(from, new Map());
  }
  const groupSpam = spamTracker.get(from);
  if (!groupSpam.has(sender)) {
    groupSpam.set(sender, []);
  }
  const timestamps = groupSpam.get(sender);
  timestamps.push(now);
  while (timestamps.length > 0 && timestamps[0] < now - 10000) {
    timestamps.shift();
  }
  const gs = database.getGroupSettings(from);
  const limit = gs.spamlimit || 3;
  const timeWindow = gs.spamtime || 4000;
  const recent = timestamps.filter(t => now - t < timeWindow);
  if (recent.length >= limit) {
    if (perm.isOwner(sender) || perm.isBotUser(sender) || perm.isCoOwner(sender)) {
      return;
    }
    if (spamLocks.has(from)) return;
    spamLocks.set(from, true);
    try {
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      if (botIsAdmin) {
        await sock.groupSettingUpdate(from, 'announcement');
        await sock.sendMessage(from, {
          text: `⚠️ Anti-spam triggered. Group locked for 60 seconds.`,
          mentions: [sender]
        });
      }
      setTimeout(async () => {
        try {
          const botIsAdminNow = await isBotAdmin(sock, from, groupMetadata);
          if (botIsAdminNow) {
            await sock.groupSettingUpdate(from, 'not_announcement');
          }
        } catch (e) {}
        spamLocks.delete(from);
      }, 60000);
    } catch (e) {
      spamLocks.delete(from);
    }
    groupSpam.delete(sender);
    if (groupSpam.size === 0) spamTracker.delete(from);
  }
};

// Anti-word handler
const handleAntiWord = async (sock, msg, from, sender, groupMetadata) => {
  const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
  if (!body.trim()) return;
  const words = database.getAntiWords(from);
  if (!words.length) return;
  const msgLower = body.toLowerCase();
  for (const word of words) {
    if (msgLower.includes(word)) {
      const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
      const senderIsTrusted = perm.isOwner(sender) || perm.isBotUser(sender) || perm.isCoOwner(sender);
      if (senderIsAdmin || senderIsTrusted) return;
      try {
        await sock.sendMessage(from, { delete: msg.key });
      } catch (e) {}
      return;
    }
  }
};

// Promotion detection & auto-demotion — gated by .detc on/off (one source of truth)
const handlePromotionDetection = async (sock, update, groupSettings) => {
  try {
    // Disabled: return immediately, send nothing
    if (groupSettings.detc !== true) return;

    const { id, participants, actor } = update;
    if (!id || !id.endsWith('@g.us')) return;

    // Fetch fresh group metadata (needed for actor detection fallback and demotion)
    const groupMetadata = await getGroupMetadata(sock, id);
    if (!groupMetadata) return;

    // Determine actor (who promoted)
    let actorJid = actor || '';
    if (!actorJid) {
      // Fallback: try to find who has group admin privileges and isn't the target
      for (const p of groupMetadata.participants || []) {
        if (p.admin === 'admin' || p.admin === 'superadmin') {
          const pId = p.id || p.jid || p.participant || '';
          const pNum = pId.split(':')[0].split('@')[0];
          if (pNum && !participants?.some(t => (typeof t === 'string' ? t : (t.id || t.jid || t.participant || '')).split(':')[0].split('@')[0] === pNum)) {
            actorJid = pId;
            break;
          }
        }
      }
      if (!actorJid) actorJid = 'unknown';
    }

    const botIsGroupAdmin = await isBotAdmin(sock, id, groupMetadata);

    // Normalize participant JIDs
    const participantJids = (participants || [])
      .map(p => (typeof p === 'string' ? p : (p.id || p.jid || p.participant || '')))
      .filter(Boolean);

    for (const pJid of participantJids) {
      // Always log the promotion
      const logKey = `${id}_${pJid}_${Date.now()}`;
      const logEntry = {
        promoted: pJid,
        actor: actorJid,
        timestamp: new Date().toISOString(),
        group: id
      };
      promotionLogs.set(logKey, logEntry);
      const logTimer = setTimeout(() => promotionLogs.delete(logKey), 10 * 60 * 1000);
      logTimer.unref?.();
      // Build actor display
      const actorDisplay = actorJid && actorJid !== 'unknown' ? `@${actorJid.split(':')[0].split('@')[0]}` : 'unknown';
      // Send notification showing both sides
      try {
        await sock.sendMessage(id, {
          text: `👁️ Promotion Detected\n👤 Granted by: ${actorDisplay}\n👑 Received by: @${pJid.split(':')[0].split('@')[0]}`,
          mentions: [actorJid, pJid].filter(Boolean)
        });
      } catch (e) {}
      // Check if target is trusted (Owner/CoOwner/BotUser)
      const isTrustedTarget = perm.isOwner(pJid) || perm.isBotUser(pJid) || perm.isCoOwner(pJid);
      if (isTrustedTarget) {
        continue;
      }
      // Check if promoted user is in the trusted bot admin list
      const isApproved = perm.isBotAdminApproved(pJid);
      if (!isApproved) {
        if (botIsGroupAdmin) {
          try {
            await sock.groupParticipantsUpdate(id, [pJid], 'demote');
            try {
              await sock.sendMessage(id, {
                text: `⚠️ Unauthorized promotion reversed.\n👤 Promoter: ${actorDisplay}\n👑 Target: @${pJid.split(':')[0].split('@')[0]}\n🔻 Demoted`,
                mentions: [actorJid, pJid].filter(Boolean)
              });
            } catch (e) {}
          } catch (e) {
            console.log('[promo] demotion failed');
          }
        } else {
          try {
            await sock.sendMessage(id, {
              text: `⚠️ Promotion by ${actorDisplay} cannot be reversed: bot is not admin.\n👑 @${pJid.split(':')[0].split('@')[0]}`,
              mentions: [actorJid, pJid].filter(Boolean)
            });
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.warn('[promo] error:', e.message);
  }
};

// Contact-card anti-spam — automatic in private chats and admin-managed groups.
// Targets ONLY the message sender in the current group — the number inside
// the contact card is never used as a removal target.
const handleAntiAcc = async (sock, msg, from, sender, groupMetadata, content) => {
  try {
    const isContactShare = content && (content.contactMessage || content.contactsArrayMessage);
    if (!isContactShare) return;
    // Ignore the bot's own messages and protected users (owner/co-owner/bot)
    if (msg.key?.fromMe) return;
    if (perm.isOwner(sender) || perm.isCoOwner(sender) || perm.isBotUser(sender)) return;

    // Dedupe: one processing attempt per message id (short TTL)
    const lockKey = `${from}:${msg.key?.id || ''}`;
    const now = Date.now();
    const lastSeen = vCardProcessed.get(lockKey);
    if (lastSeen && now - lastSeen < VCARD_LOCK_TTL_MS) return;
    vCardProcessed.set(lockKey, now);
    if (vCardProcessed.size > 500) {
      for (const [k, t] of vCardProcessed) {
        if (now - t >= VCARD_LOCK_TTL_MS) vCardProcessed.delete(k);
      }
    }

    const isGroup = from && from.endsWith('@g.us');
    const botIsAdmin = isGroup ? await isBotAdmin(sock, from, groupMetadata) : true;

    if (isGroup && !botIsAdmin) {
      console.log(`[vCard] Contact card in group ${from}: bot is not admin, skipped enforcement (sender ${maskNumber(sender)})`);
      try {
        const owners = Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber];
        for (const owner of owners) {
          const ownerNum = database.normalizeNumber(owner);
          if (!ownerNum) continue;
          await sock.sendMessage(`${ownerNum}@s.whatsapp.net`, {
            text: '⚠️ Anti-contact-card enforcement was skipped in a group where the bot is not an admin.'
          });
        }
      } catch (e) {}
      return;
    }

    // Delete only the triggering contact-card message.
    try {
      await sock.sendMessage(from, { delete: msg.key });
    } catch (e) {
      // Deletion can fail in private chats when the message is already gone.
    }

    if (!isGroup) {
      try {
        await sock.updateBlockStatus(sender, 'block');
      } catch (e) {
        console.error('[vCard] Failed to block private sender:', e.message);
      }
      return;
    }

    // Confirm the sender is still a participant in this same group.
    const stillParticipant = findParticipant(groupMetadata?.participants || [], sender);

    // 3. Remove only the sender from this same group
    if (stillParticipant) {
      try {
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
      } catch (e) {
        console.error('[vCard] Failed to kick:', e.message);
      }
    }

    // 4. Block the sender on WhatsApp (existing behavior)
    try {
      await sock.updateBlockStatus(sender, 'block');
    } catch (e) {
      console.error('[vCard] Failed to block:', e.message);
    }

    // 5. Store the SENDER (not the card content) in the canonical blocklist
    const senderNumber = sender.split('@')[0];
    database.addBlockedEntry({
      jid: sender,
      number: senderNumber,
      reason: 'ban',
      date: new Date().toISOString(),
      groupId: from,
      groupName: groupMetadata?.subject || '',
      action: 'delete+kick+block'
    });

    console.log(`[vCard] Contact card enforced: sender ${maskNumber(senderNumber)} deleted, kicked, blocked, and stored in blocklist`);
  } catch (e) {
    console.error('[vCard Error]', e.message);
  }
};

// Anti-delete detection — logs when someone deletes a message for everyone
const handleMessageUpdate = async (sock, updates) => {
  for (const { key, update } of updates) {
    try {
      if (!key || !key.remoteJid) continue;
      if (!key.remoteJid.endsWith('@g.us')) continue;
      if (key.fromMe) continue;
      if (update.message !== null && update.message !== undefined) continue;

      const from = key.remoteJid;
      const groupSettings = database.getGroupSettings(from);
      if (!groupSettings.antidelete) continue;
      if (groupSettings.mute) continue;

      const sender = key.participant || key.remoteJid;
      const action = groupSettings.antideleteAction || 'log';

      if (action === 'log') {
        await sock.sendMessage(from, {
          text: `🗑️ *تم حذف رسالة*\n\nالمرسل: @${sender.split('@')[0]}`,
          mentions: [sender]
        });
      }
    } catch (e) {
      // Per-message silent skip
    }
  }
};

module.exports = {
  handleAntilink,
  handleAntiSpam,
  handleAntiWord,
  handlePromotionDetection,
  handleAntiAcc,
  handleMessageUpdate,
  promotionLogs,
  spamTracker,
  spamLocks,
  isUrl,
  hasGroupLink
};
