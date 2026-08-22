const config = require('../../config');
const database = require('../../database');
const perm = require('../../lib/permissions');
const { resolveBanTarget, pickPendingMatch, pendingBans } = require('../../src/features/bans/resolver');
const { enforceSingleBan } = require('../../src/features/bans/enforcer');

async function doBan(sock, msg, extra, jid, number, reason) {
  if (perm.isOwner(jid)) return extra.reply('❌ لا يمكن حظر المالك.');

  const result = database.addBlockedEntry({
    jid,
    number,
    reason: reason || 'manual',
    date: new Date().toISOString(),
    groupId: extra.from.endsWith('@g.us') ? extra.from : '',
    groupName: extra.groupMetadata?.subject || '',
    action: 'block'
  });

  const entry = result.success ? result.entry : { jid, number, reason: reason || 'manual', action: 'block' };
  if (!result.success && result.error !== 'already blocked') {
    return extra.reply(`❌ ${result.error}`);
  }

  // Block on WhatsApp + remove from every group the bot is admin of
  const summary = await enforceSingleBan(sock, entry);

  let text = `✅ *تم الحظر الدائم* ${database.formatNumber(number)}\n`;
  if (result.error === 'already blocked') text += `⚠️ الرقم كان محظوراً مسبقاً — تم إعادة تطبيق الحظر.\n`;
  if (summary.blocked) text += `📵 تم حظر الرقم على واتساب.\n`;
  if (summary.removedFrom.length) text += `🚫 تمت إزالته من ${summary.removedFrom.length} مجموعة.\n`;
  if (summary.notAdmin.length) text += `⚠️ لا يمكن إزالته من ${summary.notAdmin.length} مجموعة (البوت ليس أدمن هناك).\n`;
  if (summary.errors.length && !summary.blocked && summary.removedFrom.length === 0) {
    text += `\n❌ تفاصيل: ${summary.errors.slice(0, 2).join(' | ')}`;
  }

  await extra.reply(text.trim());
}

module.exports = {
  name: 'ban',
  aliases: ['bancontact', 'permaban'],
  category: 'owner',
  description: 'حظر جهة اتصال بشكل دائم (بالاسم أو الرقم أو المنشن) مع الإزالة التلقائية من كل المجموعات',
  usage: '.ban <اسم | رقم | @منشن> [السبب]',
  coOwnerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      // Disambiguation: .ban <index> from a pending multi-match list
      if (args.length === 1 && /^\d+$/.test(args[0])) {
        const picked = pickPendingMatch(extra.sender, parseInt(args[0], 10));
        if (picked) {
          return doBan(sock, msg, extra, picked.jid, picked.number, 'manual');
        }
      }

      const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
      const mentioned = ctx.mentionedJid || [];
      const quoted = (ctx.participant && ctx.stanzaId && ctx.quotedMessage) ? ctx.participant : null;
      const query = args.join(' ').trim();

      if (!query && !mentioned.length && !quoted) {
        return extra.reply('❌ استخدم: .ban <اسم | رقم | @منشن>\nمثال: .ban 212722838422 أو .ban @مستخدم');
      }

      const result = await resolveBanTarget({
        sock,
        query,
        mentioned,
        quoted,
        groupMetadata: extra.groupMetadata,
        ownerNumbers: config.ownerNumber,
        botNumber: database.getBotNumber()
      });

      switch (result.status) {
        case 'protected':
          return extra.reply('❌ لا يمكن حظر المالك أو رقم البوت نفسه.');
        case 'not_found':
          return extra.reply('❌ لم يتم العثور على أي جهة اتصال مطابقة.\nجرّب الرقم الكامل (مع رمز الدولة) أو الاسم أو المنشن.');
        case 'number':
        case 'single':
          return doBan(sock, msg, extra, result.jid, result.number, args.slice(1).join(' ').trim() || 'manual');
        case 'multiple': {
          pendingBans.set(extra.sender, { matches: result.matches, ttl: Date.now() + 2 * 60 * 1000 });
          let text = `⚠️ *تم العثور على ${result.matches.length} تطابقات:*\n\n`;
          result.matches.forEach((m, i) => {
            text += `${i + 1}. ${m.name || m.number} — ${database.formatNumber(m.number)}\n`;
          });
          text += `\nأرسل .ban <الرقم> لاختيار التطابق الصحيح.`;
          return extra.reply(text.trim());
        }
        default:
          return extra.reply('❌ تعذر تحديد الهدف.');
      }
    } catch (e) {
      console.error('[ban error]', e.message);
      await extra.reply(`❌ ${e.message}`);
    }
  }
};
