/**
 * Session storage — stable file-based auth persistence for VPS.
 * Responsibilities:
 *  - resolve the session folder
 *  - validate an existing session (graceful failure reasons)
 *  - clear stale/corrupt sessions
 *  - load auth state via Baileys useMultiFileAuthState
 *  - import legacy KnightBot!... SESSION_ID strings
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const config = require('../config');
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

function getSessionFolder() {
  return path.resolve(path.join(PROJECT_ROOT, config.sessionName || 'session'));
}

function listSessionFiles(sessionFolder) {
  try {
    return fs.readdirSync(sessionFolder).filter(f => f.endsWith('.json'));
  } catch (e) {
    return [];
  }
}

function validateSession(sessionFolder) {
  const credsPath = path.join(sessionFolder, 'creds.json');
  try {
    if (!fs.existsSync(credsPath)) {
      return { valid: false, reason: 'no creds.json found' };
    }
    const raw = fs.readFileSync(credsPath, 'utf8');
    let creds;
    try {
      creds = JSON.parse(raw);
    } catch {
      return { valid: false, reason: 'creds.json is corrupted (invalid JSON)' };
    }
    if (!creds.me || !creds.me.id) {
      return { valid: false, reason: 'creds.json missing me.id (incomplete auth)' };
    }
    if (!creds.account || !creds.account.accountSignature) {
      return { valid: false, reason: 'creds.json missing account signature (incomplete auth)' };
    }
    const fileCount = listSessionFiles(sessionFolder).length;
    return { valid: true, me: creds.me, fileCount };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

function clearStaleSession(sessionFolder) {
  try {
    if (fs.existsSync(sessionFolder)) {
      const files = fs.readdirSync(sessionFolder);
      for (const f of files) {
        const fp = path.join(sessionFolder, f);
        if (f.endsWith('.json')) {
          fs.unlinkSync(fp);
          console.log(`[session] Removed stale session file: ${f}`);
        }
      }
    }
  } catch (e) {
    console.error('[session] Failed to clear stale session:', e.message);
  }
}

/**
 * Import a legacy KnightBot!<base64_gzip_creds> session string into creds.json.
 * Returns true if a session was written from the string.
 */
function importSessionString(sessionFolder) {
  if (!config.sessionID || !config.sessionID.startsWith('KnightBot!')) return false;
  try {
    const [header, b64data] = config.sessionID.split('!');
    if (header !== 'KnightBot' || !b64data) {
      throw new Error("Invalid session format. Expected 'KnightBot!.....'");
    }
    const cleanB64 = b64data.replace('...', '');
    const compressedData = Buffer.from(cleanB64, 'base64');
    const decompressedData = zlib.gunzipSync(compressedData);
    if (!fs.existsSync(sessionFolder)) {
      fs.mkdirSync(sessionFolder, { recursive: true });
    }
    fs.writeFileSync(path.join(sessionFolder, 'creds.json'), decompressedData, 'utf8');
    console.log('[session] Session retrieved from session data');
    return true;
  } catch (e) {
    console.error('[session] Error processing session:', e.message);
    return false;
  }
}

/**
 * Load auth state for a socket.
 * Never throws — returns { state, saveCreds } or { state: null, saveCreds: null, error }.
 */
async function loadAuthState(sessionFolder) {
  try {
    const authState = await useMultiFileAuthState(sessionFolder);
    const validation = validateSession(sessionFolder);
    if (validation.valid) {
      console.log(`[auth] Session restored — ${validation.fileCount} auth files, registered as ${validation.me.id || 'unknown'}`);
    } else {
      console.log(`[auth] Session loaded but incomplete: ${validation.reason}`);
    }
    return { state: authState.state, saveCreds: authState.saveCreds, error: null };
  } catch (e) {
    console.error('[auth] Failed to load auth state:', e.message);
    console.log('[auth] This may indicate corrupted session files. The bot will attempt to connect with fresh auth.');
    return { state: null, saveCreds: null, error: e.message };
  }
}

module.exports = {
  getSessionFolder,
  listSessionFiles,
  validateSession,
  clearStaleSession,
  importSessionString,
  loadAuthState
};
