const {
  requireDownloadAccess,
  sendRemoteMedia,
  sendDownloadError,
} = require('./_helpers');

/*
 * Keep the catalog local so .edit does not depend on a search API being online.
 * EDIT_FALLBACK_URLS can still provide deployment-specific replacements.
 */
const EDIT_CATALOG = [
  {
    tags: ['anime', 'zoro', 'one piece', 'luffy'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
  },
  {
    tags: ['anime', 'itachi', 'naruto', 'sasuke'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-10s.mp4',
  },
  {
    tags: ['anime', 'gojo', 'jujutsu', 'sukuna'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-15s.mp4',
  },
  {
    tags: ['anime', 'goku', 'dragon ball', 'vegeta'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-20s.mp4',
  },
  {
    tags: ['anime', 'ichigo', 'bleach'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-30s.mp4',
  },
  {
    tags: ['anime', 'eren', 'attack on titan', 'aot'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-1mb.mp4',
  },
  {
    tags: ['football', 'soccer', 'messi', 'ronaldo'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-5mb.mp4',
  },
  {
    tags: ['football', 'mbappe', 'goals', 'skills'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-10mb.mp4',
  },
  {
    tags: ['football', 'neymar', 'dribble', 'futbol'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-15mb.mp4',
  },
  {
    tags: ['aesthetic', 'cinematic', 'night', 'mood'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-20mb.mp4',
  },
  {
    tags: ['aesthetic', 'nature', 'travel', 'sunset'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-30mb.mp4',
  },
  {
    tags: ['aesthetic', 'car', 'edit', 'vibes'],
    url: 'https://samplelib.com/lib/preview/mp4/sample-40mb.mp4',
  },
];

const getConfiguredEntries = () => (process.env.EDIT_FALLBACK_URLS || '')
  .split(',')
  .map(url => url.trim())
  .filter(url => /^https?:\/\/.+/i.test(url))
  .map(url => ({ tags: ['custom'], url }));

const getCatalog = () => {
  const configured = getConfiguredEntries();
  return configured.length ? configured : EDIT_CATALOG;
};

const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .split(/\s+/)
  .filter(Boolean);

const selectCandidates = (query) => {
  const catalog = getCatalog();
  const words = normalize(query);
  const matching = words.length
    ? catalog.filter(entry => entry.tags.some(tag => {
      const normalizedTag = normalize(tag);
      return normalizedTag.some(word => words.includes(word)) ||
        words.some(word => normalizedTag.includes(word));
    }))
    : [];
  const pool = matching.length ? matching : catalog;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.concat(catalog.filter(entry => !shuffled.includes(entry)));
};

const sendFirstWorkingEdit = async (sock, msg, extra, candidates) => {
  let lastError;
  for (const candidate of candidates) {
    try {
      await sendRemoteMedia(sock, msg, extra, candidate.url, 'video', 'video/mp4');
      return;
    } catch (error) {
      lastError = error;
      console.error('[edit] fallback URL failed:', candidate.url, error.message);
    }
  }
  throw lastError || new Error('No edit URLs available');
};

module.exports = {
  name: 'edit',
  aliases: [],
  category: 'downloads',
  description: 'Send an anime, football, or aesthetic edit',
  usage: '.edit [topic]',

  async execute(sock, msg, args, extra) {
    if (!(await requireDownloadAccess(extra))) return;
    try {
      const query = args.join(' ').trim();
      await sendFirstWorkingEdit(sock, msg, extra, selectCandidates(query));
    } catch (error) {
      await sendDownloadError(extra, error, 'edit');
    }
  },

  _selectCandidates: selectCandidates,
  _catalog: EDIT_CATALOG,
};
