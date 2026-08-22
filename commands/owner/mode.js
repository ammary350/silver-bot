const config = require('../../config');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'mode',
  aliases: ['botmode', 'privatemode', 'publicmode'],
  description: 'Toggle bot between private and public mode',
  usage: '.mode <private/public>',
  category: 'owner',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const currentMode = config.selfMode ? 'private' : 'public';
        const description = config.selfMode
          ? 'Only Owner, Co-owner, and Admin can use commands'
          : 'Bot is publicly active; commands require a bot role';

        return extra.reply(
          `🤖 *Bot Mode*\n\n` +
          `Current Mode: *${currentMode.toUpperCase()}*\n` +
          `Status: ${description}\n\n` +
          `Usage:\n` +
          `  .mode private - Role-holders only\n` +
          `  .mode public - Role-gated public access`
        );
      }

      const mode = args[0].toLowerCase();

      if (mode === 'private' || mode === 'priv') {
        if (config.selfMode) {
          return extra.reply('🔒 Bot is already in *PRIVATE* mode.\nOnly Owner, Co-owner, and Admin can use commands.');
        }

        updateConfig('selfMode', true);
        config.selfMode = true;
        return extra.reply('🔒 Bot mode changed to *PRIVATE*\n\nOnly users with a bot role can use commands.');
      }

      if (mode === 'public' || mode === 'pub') {
        if (!config.selfMode) {
          return extra.reply('🌐 Bot is already in *PUBLIC* mode.\nCommands still require a bot role.');
        }

        updateConfig('selfMode', false);
        config.selfMode = false;
        return extra.reply('🌐 Bot mode changed to *PUBLIC*\n\nBot is publicly active but commands still require a bot role.');
      }

      return extra.reply('❌ Invalid mode!\nUsage: .mode <private/public>');

    } catch (error) {
      console.error('Mode command error:', error);
      await extra.reply('❌ Error changing bot mode.');
    }
  }
};

function updateConfig(key, value) {
  try {
    const configPath = path.join(__dirname, '..', '..', 'config.js');
    let configContent = fs.readFileSync(configPath, 'utf8');

    const regex = new RegExp(`(${key}:\\s*)(true|false)`, 'g');
    configContent = configContent.replace(regex, `$1${value}`);

    fs.writeFileSync(configPath, configContent, 'utf8');

    delete require.cache[require.resolve('../../config')];
  } catch (error) {
    console.error('Error saving config:', error);
  }
}
