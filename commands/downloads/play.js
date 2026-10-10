const {
  requireDownloadAccess,
  requestJson,
  findUrl,
  sendRemoteMedia,
  sendDownloadError,
} = require('./_helpers');

module.exports = {
  name: 'play',
  aliases: ['song'],
  category: 'downloads',
  description: 'Search and download a song as MP3',
  usage: '.play <song>',

  async execute(sock, msg, args, extra) {
    if (!(await requireDownloadAccess(extra))) return;
    try {
      const query = args.join(' ').trim();
      if (!query) return extra.reply('❌ يرجى كتابة اسم الأغنية.');
      const apiUrl = process.env.PLAY_API_URL || 'https://api.akuari.my.id/downloader/youtubeplay';
      const data = await requestJson(apiUrl, { params: { query } });
      const mediaUrl = findUrl(data);
      if (!mediaUrl) throw new Error('No audio URL returned');
      await sendRemoteMedia(sock, msg, extra, mediaUrl, 'audio', 'audio/mpeg');
    } catch (error) {
      await sendDownloadError(extra, error, 'play');
    }
  },
};
