const { GoogleGenAI } = require('@google/genai');
const {
  requireDownloadAccess,
  sendRemoteMedia,
  sendDownloadError,
} = require('./_helpers');

const BACKUP_EDIT_URLS = [
  'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-10s.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-15s.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-20s.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-30s.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-1mb.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-5mb.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-10mb.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-15mb.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-20mb.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-30mb.mp4',
  'https://samplelib.com/lib/preview/mp4/sample-40mb.mp4',
];

const getBackupUrls = () => {
  const configured = (process.env.EDIT_FALLBACK_URLS || '')
    .split(',')
    .map(url => url.trim())
    .filter(url => /^https?:\/\/.+\.mp4(?:$|[?#])/i.test(url));
  const urls = configured.length ? configured : BACKUP_EDIT_URLS;
  return [...urls].sort(() => Math.random() - 0.5);
};

const extractMp4Url = (text) => {
  const matches = String(text || '').match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return matches
    .map(url => url.replace(/[.,;:!?]+$/, ''))
    .find(url => /\.mp4(?:$|[?#])/i.test(url));
};

const askGeminiForEdit = async (query) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const ai = new GoogleGenAI({ apiKey });
  const prompt = [
    'Return exactly one direct, publicly downloadable MP4 video URL and nothing else.',
    'The URL must point directly to an .mp4 file, not a webpage, search result, stream page, or API endpoint.',
    `Find a high-quality short edit for this topic: ${query}`,
  ].join('\n');
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_EDIT_MODEL || 'gemini-2.5-flash',
    contents: prompt,
  });
  return extractMp4Url(response.text);
};

const sendFirstWorkingEdit = async (sock, msg, extra, urls) => {
  let lastError;
  for (const url of urls) {
    try {
      await sendRemoteMedia(sock, msg, extra, url, 'video', 'video/mp4');
      return;
    } catch (error) {
      lastError = error;
      console.error('[edit] media URL failed:', error.message);
    }
  }
  throw lastError || new Error('No working edit URL available');
};

module.exports = {
  name: 'edit',
  aliases: [],
  category: 'downloads',
  description: 'Send an edit found with Gemini or a backup video',
  usage: '.edit [topic]',

  async execute(sock, msg, args, extra) {
    if (!(await requireDownloadAccess(extra))) return;

    try {
      const query = args.join(' ').trim();
      const fallbackUrls = getBackupUrls();
      let urls = fallbackUrls;

      if (query) {
        try {
          const geminiUrl = await askGeminiForEdit(query);
          if (geminiUrl) urls = [geminiUrl, ...fallbackUrls];
        } catch (error) {
          console.error('[edit] Gemini lookup failed:', error.message);
        }
      }

      await sendFirstWorkingEdit(sock, msg, extra, urls);
    } catch (error) {
      await sendDownloadError(extra, error, 'edit');
    }
  },

  _extractMp4Url: extractMp4Url,
  _backupUrls: BACKUP_EDIT_URLS,
};
