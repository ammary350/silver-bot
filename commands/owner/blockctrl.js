const database = require('../../database');
const blockctrl = require('../../src/features/blockctrl');

module.exports = {
  name: 'blockctrl',
  aliases: ['blockcontrol', 'setblockctrl', 'unsetblockctrl'],
  category: 'owner',
  description: 'Set / remove the Block Control group (automatic phone-number blocklisting)',
  usage: '.blockctrl set | .blockctrl off | .blockctrl',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const arg = String(args[0] || '').toLowerCase();
      if (!arg) {
        const current = blockctrl.getBlockControlGroup();
        return extra.reply(current
          ? '✅ *Block Control group* is set.\n\nUse: `.blockctrl off` to remove it.'
          : '❌ No Block Control group is set.\n\nRun `.blockctrl set` inside the group you want to use as the Block Control group.');
      }
      if (arg === 'set' || arg === 'enable') {
        if (!extra.isGroup) return extra.reply('❌ Run `.blockctrl set` inside the group you want to select.');
        blockctrl.setBlockControlGroup(extra.from);
        return extra.reply('✅ This group is now the *Block Control group*.\nPhone numbers sent here are blocklisted automatically.');
      }
      if (arg === 'off' || arg === 'disable' || arg === 'remove' || arg === 'unset' || arg === 'none') {
        blockctrl.clearBlockControlGroup();
        return extra.reply('✅ Block Control group removed.');
      }
      return extra.reply('Usage: `.blockctrl set` (inside the group) | `.blockctrl off` | `.blockctrl`');
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};