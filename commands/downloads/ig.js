const {
  requireDownloadAccess,
  requestJson,
  findUrl,
  sendRemoteMedia,
  sendDownloadError,
} = require('./_helpers');

module.exports = {
  name: 'ig',
  aliases: ['instagram'],
  category: 'downloads',
  description: 'Download an Instagram video',
  usage: '.ig <url>',

  async execute(sock, msg, args, extra) {
    if (!(await requireDownloadAccess(extra))) return;
    try {
      const input = args[0];
      if (!input || !/^https?:\/\/(?:www\.)?instagram\.com\//i.test(input)) {
        return extra.reply('❌ يرجى إرسال رابط Instagram صحيح.');
      }
      const apiUrl = process.env.INSTAGRAM_API_URL || 'https://api.tiklydown.eu.org/api/download';
      const data = await requestJson(apiUrl, { params: { url: input } });
      const mediaUrl = findUrl(data);
      if (!mediaUrl) throw new Error('No Instagram media URL returned');
      await sendRemoteMedia(sock, msg, extra, mediaUrl, 'video', 'video/mp4');
    } catch (error) {
      await sendDownloadError(extra, error, 'ig');
    }
  },
};
