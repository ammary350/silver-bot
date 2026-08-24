const database = require('../../src/storage/database');
const { isBotAdmin } = require('../../src/features/groups/metadata');
const { getTrackedGroups } = require('../../src/features/linkhub');

const isValidBotGroup = async (sock, group) => {
  if (!group || !group.id) return false;

  try {
    const metadata = await sock.groupMetadata(group.id);
    if (!metadata || !metadata.participants) return false;

    const botNumbers = new Set(
      [sock.user?.id, sock.user?.lid]
        .filter(Boolean)
        .map(value => String(value).split(':')[0].split('@')[0])
        .filter(Boolean)
    );

    const botParticipant = metadata.participants.find(participant => {
      const id = participant.id || participant.jid || participant.participant || '';
      const number = String(id).split(':')[0].split('@')[0];
      return botNumbers.has(number);
    });

    const adminStatus = botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin');
    const restricted = Boolean(
      metadata.restrict ||
      metadata.isBanned ||
      metadata.banned ||
      metadata.locked ||
      metadata.status === 'banned' ||
      metadata.status === 'restricted' ||
      metadata.status === 'locked' ||
      /banned|restricted|not_authorized/gi.test(String(metadata.status || ''))
    );

    return Boolean(adminStatus && !restricted && group.id && !group.id.startsWith('status@'));
  } catch (error) {
    return false;
  }
};

module.exports = {
  name: 'botstats',
  aliases: ['groupstats'],
  category: 'general',
  async execute(sock, msg, args, extra) {
    try {
      if (extra.isGroup && !(await isBotAdmin(sock, extra.from, extra.groupMetadata))) {
        return extra.reply('❌ عذراً، يجب أن أكون مشرفاً (Admin) في هذه المجموعة لجلب الإحصائيات!');
      }

      const groups = await getTrackedGroups(sock);
      const list = Array.isArray(groups) ? groups : [];
      const results = await Promise.allSettled(list.map(async group => ({
        group,
        valid: await isValidBotGroup(sock, group)
      })));
      const validGroups = results
        .filter(result => result.status === 'fulfilled' && result.value.valid)
        .map(result => result.value.group);

      const lines = validGroups.map(group => {
        let settings = {};
        try {
          settings = database.getGroupSettings(group.id) || {};
        } catch (error) {
          console.error('[botstats] group settings unavailable:', error.message);
        }
        const icon = key => settings[key] ? '✅' : '❌';
        return `• ${group.subject || group.id}\n  Anti-Link ${icon('antilink')} | Anti-Spam ${icon('antispam')} | Anti-Tag ${icon('antitag')} | Anti-Word ${icon('antiword')}\n  Anti-Contact ✅ (global) | Anti-Delete ${icon('antidelete')}`;
      });

      return extra.reply(`📊 *إحصائيات البوت*\n\nعدد المجموعات الصالحة: ${validGroups.length}\n\n${lines.join('\n') || 'لا توجد مجموعات صالحة.'}`);
    } catch (error) {
      console.error('[botstats error]', error.message);
      return extra.reply(`❌ تعذر جلب إحصائيات المجموعات: ${error.message}`);
    }
  }
};