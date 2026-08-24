const { getAllStats } = require('../../src/utils/groupstats');

module.exports = {
  name: 'astats',
  aliases: ['activitystats'],
  category: 'general',
  description: 'Show message activity for this group',
  usage: '.astats',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const stats = getAllStats(extra.from);
    const dates = Object.keys(stats).sort().reverse();
    if (!dates.length) return extra.reply('📊 No message statistics are available for this group yet.');

    const lines = dates.slice(0, 14).map(date => {
      const day = stats[date] || {};
      const users = Object.entries(day.users || {})
        .sort(([, first], [, second]) => second - first)
        .slice(0, 5)
        .map(([user, count]) => `@${user.split('@')[0]}: ${count}`)
        .join(', ');
      return `• ${date}: ${day.total || 0} messages${users ? `\n  ${users}` : ''}`;
    });

    const mentions = dates.slice(0, 14).flatMap(date => Object.keys(stats[date]?.users || {}));
    return extra.reply(`📊 *Group Activity*\n\n${lines.join('\n')}\n\nShowing the last ${Math.min(dates.length, 14)} day(s).`);
  }
};
