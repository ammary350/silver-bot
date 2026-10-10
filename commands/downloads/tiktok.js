const {
  requireDownloadAccess,
  requestJson,
  findUrl,
  sendRemoteMedia,
  sendDownloadError,
} = require('./_helpers');

module.exports = {
  name: 'tiktok',
  aliases: [],
  category: 'downloads',
  description: 'Download a TikTok video without watermark',
  usage: '.tiktok <url>',

  async execute(sock, msg, args, extra) {
    if (!(await requireDownloadAccess(extra))) return;
    try {
      const input = args[0];
      if (!input || !/^https?:\/\/(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\//i.test(input)) {
        return extra.reply('❌ يرجى إرسال رابط TikTok صحيح.');
      }
      const apiUrl = process.env.TIKTOK_API_URL || 'https://www.tikwm.com/api/';
      const data = await requestJson(apiUrl, { method: 'post', data: { url: input, hd: 1 } });
      const mediaUrl = data?.data?.hdplay || data?.data?.play || findUrl(data);
      if (!mediaUrl) throw new Error('No TikTok media URL returned');
      await sendRemoteMedia(sock, msg, extra, mediaUrl, 'video', 'video/mp4');
    } catch (error) {
      await sendDownloadError(extra, error, 'tiktok');
    }
  },
};
