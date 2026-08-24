const normalizeJid = value => String(value || '').split(':')[0].toLowerCase();
const digitsOnly = value => String(value || '').replace(/\D/g, '');

const getBotParticipant = (sock, group) => {
  const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean);
  const botJids = new Set(botIds.map(normalizeJid));
  const botNumbers = new Set(botIds.map(digitsOnly).filter(Boolean));
  return (group?.participants || []).find(participant => {
    const participantIds = [participant.id, participant.jid, participant.participant, participant.userJid]
      .filter(Boolean);
    return participantIds.some(id => botJids.has(normalizeJid(id)) || botNumbers.has(digitsOnly(id)));
  });
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
        .sort((first, second) => Number(first.isAdmin) - Number(second.isAdmin));

      const lines = statuses.map(status => `${status.name} - Bot is Admin: ${status.isAdmin ? '✅' : '❌'}`);
      return extra.reply(lines.join('\n') || 'No groups found.');
    } catch (error) {
      console.error('[botstats error]', error.message);
      return extra.reply(`❌ تعذر جلب إحصائيات المجموعات: ${error.message}`);
    }
  }
};