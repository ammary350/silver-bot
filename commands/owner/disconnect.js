const fs = require('fs');
const path = require('path');
const config = require('../../config');

module.exports = {
  name: 'disconnect',
  aliases: ['dc', 'logout'],
  category: 'owner',
  description: 'Disconnect bot and clear session (preserves settings)',
  usage: '.disconnect',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      await extra.reply('🔌 Disconnecting bot and clearing session...');

      const sessionFolder = path.resolve(`./${config.sessionName}`);

      if (fs.existsSync(sessionFolder)) {
        const files = fs.readdirSync(sessionFolder);
        for (const f of files) {
          const fp = path.join(sessionFolder, f);
          if (f.endsWith('.json')) {
            fs.unlinkSync(fp);
          }
        }
      }

      try {
        sock.removeAllListeners();
        sock.ev.removeAllListeners();
        await sock.end(undefined);
        sock.ws?.close();
      } catch (e) {}

      await extra.reply('✅ Session cleared. All bot settings preserved.\n🔄 Restart the bot to re-link WhatsApp.');

      setTimeout(() => {
        process.exit(0);
      }, 1000);
    } catch (error) {
      console.error('Disconnect error:', error);
      await extra.reply(`❌ Error disconnecting: ${error.message}`);
    }
  },
};
