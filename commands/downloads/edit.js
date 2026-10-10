const {
  requireDownloadAccess,
  requestJson,
  findUrl,
  sendRemoteMedia,
  sendDownloadError,
} = require('./_helpers');

module.exports = {
  name: 'edit',
  aliases: [],
  category: 'downloads',
  description: 'Search and download an edit by topic',
  usage: '.edit <topic>',

  async execute(sock, msg, args, extra) {
    if (!(await requireDownloadAccess(extra))) return;
    try {
      const topic = args.join(' ').trim();
      if (!topic) return extra.reply('❌ يرجى كتابة الشخصية أو الموضوع المطلوب.');
      const apiUrl = process.env.EDIT_API_URL || 'https://www.tikwm.com/api/feed/search';
      const data = await requestJson(apiUrl, { params: { keywords: topic, count: 10 } });
      const mediaUrl = findUrl(data);
      if (!mediaUrl) throw new Error('No edit media URL returned');
      await sendRemoteMedia(sock, msg, extra, mediaUrl, 'video', 'video/mp4');
    } catch (error) {
      await sendDownloadError(extra, error, 'edit');
    }
  },
};
