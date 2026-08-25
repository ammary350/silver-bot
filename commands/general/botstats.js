const normalizeJid = value => String(value || '').split(':')[0].toLowerCase();
const digitsOnly = value => String(value || '').replace(/\D/g, '');

const getBotParticipant = (sock, group) => {
  const botId = String(sock.user?.id || '').split(':')[0].split('@')[0];
  const botJid = botId ? `${botId}@s.whatsapp.net` : '';
  return (group?.participants || []).find(participant =>
    [participant.id, participant.jid, participant.participant, participant.userJid].includes(botJid)
  );
};

module.exports = {
  name: 'botstats',
  aliases: ['groupstats'],
  category: 'general',
  async execute(sock, msg, args, extra) {
    try {
      const groups = await sock.groupFetchAllParticipating();
      const statuses = Object.values(groups || {})
        .filter(group => group?.id && group.id.endsWith('@g.us'))
        .map(group => {
          const participant = getBotParticipant(sock, group);
          const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
          return {
            name: group.subject || group.id,
            isAdmin
          };
        })
        .filter(status => !status.isAdmin);

      const lines = statuses.map(status => `${status.name} - ❌ Needs Admin`);
      return extra.reply(lines.join('\n') || '✅ البوت مشرف في جميع المجموعات ولا توجد أي مشاكل.');
    } catch (error) {
      console.error('[botstats error]', error.message);
      return extra.reply(`❌ تعذر جلب إحصائيات المجموعات: ${error.message}`);
    }
  }
};