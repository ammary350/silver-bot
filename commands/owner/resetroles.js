const database = require('../../database');
const config = require('../../config');
const { normalizeJidWithLid } = require('../../src/core/jid');

const CONFIRM_TTL_MS = 30000;
let ttlMs = CONFIRM_TTL_MS;

// Pending confirmations: ownerNumber -> { chat, expiresAt }
const pending = new Map();

// Canonical phone identity (digits) for a stored JID/LID identity, using PN/LID mappings
const canonicalNumber = (jid) => {
  const resolved = normalizeJidWithLid(jid);
  const viaJid = database.normalizeNumber(resolved);
  if (viaJid) return viaJid;
  const digits = String(jid || '').split('@')[0].replace(/\D/g, '');
  return database.normalizeNumber(digits) || '';
};

const purgeExpired = () => {
  const now = Date.now();
  for (const [key, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(key);
  }
};

module.exports = {
  name: 'resetroles',
  aliases: ['reset-roles', 'clearroles', 'resetall'],
  category: 'owner',
  description: 'Reset all role assignments (co-owners, bot admins) — owners preserved (owner only)',
  usage: '.resetroles | .resetroles confirm',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      purgeExpired();
      const chat = msg.key.remoteJid || extra.from || '';
      const senderNum = canonicalNumber(extra.sender);
      const key = `${senderNum}:${chat}`;
      const arg = String(args[0] || '').toLowerCase();

      const coCount = database.getCoOwners().length;
      const admCount = database.getBotAdmins().length;
      const ownerCount = new Set((Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber])
        .map(database.normalizeNumber)
        .filter(Boolean)).size;

      if (arg !== 'confirm') {
        pending.set(key, { expiresAt: Date.now() + ttlMs });
        return extra.reply(
          `🧹 *Role Reset Preview*\n\n` +
          `👑 Owners: ${ownerCount} — preserved (configured)\n` +
          `🤖 Bot identity: preserved\n` +
          `⭐ Co-owners: ${coCount} — will be cleared\n` +
          `🛡️ Bot admins: ${admCount} — will be cleared\n\n` +
          `Reply \`.resetroles confirm\` within 30 seconds to apply.`
        );
      }

      const entry = pending.get(key);
      if (!entry || entry.expiresAt <= Date.now()) {
        pending.delete(key);
        return extra.reply('❌ No pending reset or it expired.\nRun `.resetroles` again, then `.resetroles confirm` within 30 seconds.');
      }
      pending.delete(key);

      // Clear all co-owners and bot admins (persisted via their own data files)
      for (const c of database.getCoOwners().slice()) database.removeCoOwner(c);
      for (const a of database.getBotAdmins().slice()) database.removeBotAdmin(a);

      // Rebuild: configured Owners are the only roles; bot identity untouched.
      // Owners live in config (never written/removed here); WhatsApp group
      // admin status, group settings, anti features, blocklist and control
      // groups are never touched.

      return extra.reply(
        '✅ Roles reset. تم تصفير جميع الأدوار بنجاح.\n' +
        '👑 Owners were preserved — تم الحفاظ على المالكين المحددين.\n' +
        '⭐ Co-owners cleared — تم حذف جميع المالكين المساعدين.\n' +
        '🛡️ Bot admins cleared — تم حذف جميع مشرفي البوت.'
      );
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  },

  // Set the confirmation for an owner in a chat (used by tests)
  _setConfirmation: (senderNum, chat) => {
    pending.set(`${senderNum}:${chat}`, { expiresAt: Date.now() + ttlMs });
  },

  _getPendingCount: () => pending.size,

  // Override confirmation TTL (used by tests)
  _setTtl: (ms) => { ttlMs = ms; }
};