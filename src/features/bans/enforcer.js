/**
 * Contact-ban enforcement — automatic, no manual checking.
 *  - enforces a single ban: WhatsApp block + remove from every group the bot is admin of
 *  - scans ALL groups at startup and removes banned contacts wherever possible
 *  - live enforcement when a banned contact joins a group
 *
 * Uses Baileys: fetchBlocklist(), updateBlockStatus(), groupFetchAllParticipating(), groupParticipantsUpdate().
 */

const database = require('../../storage/database');
const perm = require('../../core/permissions');
const { getGroupMetadata, isBotAdmin } = require('../groups/metadata');

const BAN_STEP_DELAY_MS = 1200; // rate-limit safety between groups/entries

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mask numbers in logs (last 3 digits only)
const maskNumber = (value) => {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits ? `***${digits.slice(-3)}` : '***';
};

function cleanJid(jid) {
  if (!jid || typeof jid !== 'string') return '';
  return jid.split(':')[0].split('@')[0];
}

function botIsAdminInMetadata(sock, metadata) {
  const botNum = cleanJid(sock?.user?.id);
  if (!botNum || !metadata?.participants) return false;
  return metadata.participants.some(p => {
    if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
    return cleanJid(p.id) === botNum;
  });
}

/**
 * Ensure a JID is blocked on WhatsApp (idempotent).
 * @returns {boolean} true when a block was applied
 */
async function ensureBlocked(sock, jid, number) {
  try {
    let blocklist = [];
    try {
      blocklist = await sock.fetchBlocklist();
    } catch (e) {
      // fetch may fail on fresh sessions — proceed with empty list
    }
    const already = blocklist.some(b => cleanJid(b) === number);
    if (!already) {
      await sock.updateBlockStatus(jid, 'block');
      return true;
    }
    return false;
  } catch (e) {
    console.error(`[bans] Failed to block ${maskNumber(number)}: ${e.message}`);
    return false;
  }
}

/**
 * Remove a banned contact from every participating group where the bot is admin.
 * @returns {{removedFrom: string[], notAdmin: string[], errors: string[]}}
 */
async function removeFromGroups(sock, number, groups) {
  const result = { removedFrom: [], notAdmin: [], errors: [] };
  const entries = Object.entries(groups || {});

  for (const [groupId, metadata] of entries) {
    const members = metadata?.participants || [];
    const member = members.find(p => cleanJid(p.id || p.jid) === number);
    if (!member) continue;

    if (botIsAdminInMetadata(sock, metadata)) {
      try {
        await sock.groupParticipantsUpdate(groupId, [member.id || member.jid], 'remove');
        result.removedFrom.push(groupId);
        console.log(`[bans] Removed banned contact ${maskNumber(number)} from ${groupId}`);
      } catch (e) {
        result.errors.push(`remove(${groupId}): ${e.message}`);
      }
    } else {
      result.notAdmin.push(groupId);
      console.log(`[bans] Cannot remove ${maskNumber(number)} from ${groupId}: bot is not admin`);
    }
    await sleep(400);
  }
  return result;
}

/**
 * Enforce one ban entry: WhatsApp block + removal from all groups.
 */
async function enforceSingleBan(sock, banEntry, groups) {
  const number = database.normalizeNumber(banEntry.number || banEntry.jid);
  const jid = (banEntry.jid && String(banEntry.jid).includes('@')) ? banEntry.jid : `${number}@s.whatsapp.net`;

  const summary = { blocked: false, removedFrom: [], notAdmin: [], errors: [] };

  if (perm.isOwner(jid)) {
    summary.errors.push('owner is protected');
    return summary;
  }

  summary.blocked = await ensureBlocked(sock, jid, number);

  let allGroups = groups;
  if (!allGroups) {
    try {
      allGroups = await sock.groupFetchAllParticipating();
    } catch (e) {
      summary.errors.push(`groupFetch: ${e.message}`);
      return summary;
    }
  }

  const removal = await removeFromGroups(sock, number, allGroups);
  summary.removedFrom = removal.removedFrom;
  summary.notAdmin = removal.notAdmin;
  summary.errors.push(...removal.errors);
  return summary;
}

/**
 * Startup scan — reload every banned contact and re-enforce everywhere.
 * Runs after connection is open; sequential with delays to avoid rate limits.
 * @returns {Promise<{enforced: number, removed: number, notAdmin: number}>}
 */
async function enforceAllBans(sock, { onProgress = null } = {}) {
  const entries = database.getRichBlocklist();
  if (!entries.length) {
    console.log('[bans] No banned contacts to enforce.');
    return { enforced: 0, removed: 0, notAdmin: 0 };
  }

  console.log(`[bans] Enforcing ${entries.length} banned contact(s) across all groups...`);

  let groups = {};
  try {
    groups = await sock.groupFetchAllParticipating();
    console.log(`[bans] Scanning ${Object.keys(groups).length} group(s)`);
  } catch (e) {
    console.error(`[bans] Could not fetch groups: ${e.message}`);
  }

  let removed = 0;
  let notAdmin = 0;

  for (const entry of entries) {
    try {
      const summary = await enforceSingleBan(sock, entry, groups);
      removed += summary.removedFrom.length;
      notAdmin += summary.notAdmin.length;
      if (onProgress) onProgress(entry, summary);
    } catch (e) {
      console.error(`[bans] Enforce failed for ${maskNumber(entry.number)}: ${e.message}`);
    }
    await sleep(BAN_STEP_DELAY_MS);
  }

  console.log(`[bans] Enforcement done — ${removed} removal(s), ${notAdmin} group(s) where bot is not admin.`);
  return { enforced: entries.length, removed, notAdmin };
}

/**
 * Live enforcement — a banned contact just joined a group.
 * Kicks when the bot is admin; otherwise locks the group and alerts (fallback).
 */
async function handleParticipantAdd(sock, update) {
  const { id, participants } = update;
  if (!id || !id.endsWith('@g.us')) return;

  const entries = database.getRichBlocklist();
  if (!entries.length) return;

  const bannedNumbers = new Set(
    entries.map(e => database.normalizeNumber(e.number || e.jid)).filter(Boolean)
  );

  for (const participant of participants) {
    const pJid = typeof participant === 'string' ? participant : (participant.id || participant.jid || participant.participant || '');
    const number = database.normalizeNumber(pJid);
    if (!number || !bannedNumbers.has(number)) continue;
    if (perm.isOwner(pJid)) continue;

    console.log(`[bans] Banned contact ${maskNumber(number)} joined ${id}`);
    const groupMetadata = await getGroupMetadata(sock, id);
    const botAdmin = await isBotAdmin(sock, id, groupMetadata);

    if (botAdmin) {
      try {
        await sock.groupParticipantsUpdate(id, [pJid], 'remove');
        console.log(`[bans] Removed banned contact ${maskNumber(number)} from ${id}`);
      } catch (e) {
        console.error(`[bans] Failed to remove ${maskNumber(number)} from ${id}: ${e.message}`);
      }
    } else {
      // Fallback: bot not admin — lock the group without sending a message.
      try {
        await sock.groupSettingUpdate(id, 'announcement');
      } catch (e) {
        console.error(`[bans] Cannot remove ${maskNumber(number)} from ${id}: bot is not admin`);
      }
    }
  }
}

module.exports = { enforceSingleBan, enforceAllBans, handleParticipantAdd, ensureBlocked };
