const database = require('../../database');

const STATS_GROUP_SETTING = 'statsGroup';

module.exports = {
  name: 'setstatsgroup',
  aliases: [],
  category: 'general',
  description: 'Set this group as the bot statistics group',
  usage: '.setstatsgroup',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    database.setSetting(STATS_GROUP_SETTING, extra.from);
    return extra.reply('✅ This group is now the statistics group.');
  }
};
