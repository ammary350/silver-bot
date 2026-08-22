const config = require('../../config');
const APIs = require('../../utils/api');

module.exports = {
  name: 'imagine',
  aliases: ['imagineai', 'genimage'],
  category: 'ai',
  description: 'Generate an image from text prompt',
  usage: '.imagine <prompt>',

  async execute(sock, msg, args, extra) {
    try {
      if (!args.length) {
        return extra.reply('Usage: .imagine <prompt>\nExample: .imagine a beautiful sunset over mountains');
      }
      const prompt = args.join(' ');
      await sock.sendMessage(extra.from, { text: config.messages.wait }, { quoted: msg });
      const result = await APIs.generateImage(prompt);
      if (result && result.buffer) {
        await sock.sendMessage(extra.from, { image: result.buffer, caption: `🎨 *${prompt}*` }, { quoted: msg });
      } else if (result && result.url) {
        await sock.sendMessage(extra.from, { image: { url: result.url }, caption: `🎨 *${prompt}*` }, { quoted: msg });
      } else {
        await extra.reply('❌ Failed to generate image.');
      }
    } catch (e) {
      await extra.reply(`❌ Error: ${e.message}`);
    }
  }
};
