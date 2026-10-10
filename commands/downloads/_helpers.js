const axios = require('axios');

const DOWNLOAD_ERROR = '❌ يتعذر إرسال الفيديو أو المقطع حالياً، قد يكون الرابط خاطئاً أو الخدمة متوقفة.';

global.allowedDownloadGroups = global.allowedDownloadGroups || new Set();

const isDownloadAllowed = (extra) => !extra.isGroup || global.allowedDownloadGroups.has(extra.from);

const requireDownloadAccess = async (extra) => {
  if (isDownloadAllowed(extra)) return true;
  await extra.reply('❌ ميزة التحميل غير مفعلة في هذه المجموعة. يجب على المالك تفعيلها أولاً عبر أمر `.setdown`');
  return false;
};

const requestJson = async (url, options = {}) => {
  const response = await axios({
    url,
    method: options.method || 'get',
    data: options.data,
    params: options.params,
    responseType: 'json',
    timeout: 45000,
    maxContentLength: 2 * 1024 * 1024,
    maxBodyLength: 2 * 1024 * 1024,
  });
  return response.data;
};

const findUrl = (value, seen = new Set()) => {
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value : null;
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item, seen);
      if (found) return found;
    }
    return null;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && /^https?:\/\//i.test(item) &&
        /url|download|play|video|audio|mp3|mp4|nowatermark/i.test(key)) {
      return item;
    }
    const found = findUrl(item, seen);
    if (found) return found;
  }
  return null;
};

const downloadBuffer = async (url, responseType = 'arraybuffer') => {
  const response = await axios.get(url, {
    responseType,
    timeout: 90000,
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024,
  });
  return Buffer.from(response.data);
};

const sendRemoteMedia = async (sock, msg, extra, url, type, mimetype) => {
  const buffer = await downloadBuffer(url);
  await sock.sendMessage(extra.from, { [type]: buffer, mimetype }, { quoted: msg });
};

const sendDownloadError = async (extra, error, commandName) => {
  console.error(`[${commandName}] download failed:`, error.message);
  await extra.reply(DOWNLOAD_ERROR);
};

module.exports = {
  DOWNLOAD_ERROR,
  requireDownloadAccess,
  requestJson,
  findUrl,
  sendRemoteMedia,
  sendDownloadError,
};
