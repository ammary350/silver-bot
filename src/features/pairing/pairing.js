/**
 * Pairing-code login — reliable phone-number pairing for Baileys.
 * Fixes over the old flow:
 *  - strict number validation with clear errors (digits + country code only)
 *  - skip request when the session is already registered
 *  - wait for the socket to be ready, then retry once safely
 *  - no duplicate in-flight requests for the same number
 */

const PAIRING_RETRY_WAIT_MS = 5000;
const CONNECTION_READY_TIMEOUT_MS = 30000;

// Numbers with an in-flight request (prevent duplicate codes for the same fresh session)
const inFlight = new Set();

/**
 * Normalize a phone number for pairing.
 * Accepts +, spaces, dashes, parentheses — strips everything except digits.
 * Strips a leading 00 international dialing prefix (e.g., 00212722838422).
 * Must include country code (>= 10 digits) and be realistic (<= 15 digits).
 * Throws a clear error when the format is invalid.
 */
function normalizePhoneNumber(input) {
  if (input === undefined || input === null || String(input).trim() === '') {
    throw new Error('Phone number is required. Use country code + number, digits only (e.g., 212722838422).');
  }
  const raw = String(input).trim();
  let digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('00') && digits.length <= 17) {
    digits = digits.slice(2);
  }
  if (digits.length < 10) {
    throw new Error(`Invalid phone number "${raw}". Must include country code and be at least 10 digits (no +, spaces, hyphens or parentheses). Example: 212722838422`);
  }
  if (digits.length > 15) {
    throw new Error(`Invalid phone number "${raw}". Too many digits (max 15). Expected country code + number, e.g., 212722838422`);
  }
  return digits;
}

/**
 * True when the socket already holds a registered session (pairing not needed).
 */
function isSessionRegistered(sock) {
  const user = sock && sock.user;
  return !!(user && user.id);
}

/**
 * Request a pairing code from WhatsApp.
 * - validates the number (throws on bad format)
 * - skips when the session is already registered (throws clear message)
 * - if the first attempt fails or returns no code, waits for the socket to be
 *   ready (up to 30s) and retries exactly once
 *
 * @returns {Promise<{code: string, number: string}>}
 */
async function requestPairingCode(sock, rawNumber) {
  const number = normalizePhoneNumber(rawNumber);

  if (isSessionRegistered(sock)) {
    const registered = String(sock.user.id).split(':')[0].replace(/[^0-9]/g, '');
    throw new Error(`Session is already registered as ***${registered.slice(-3)}. Pairing skipped.`);
  }

  if (inFlight.has(number)) {
    console.log(`[pairing] Request already in flight for ***${String(number).slice(-3)} — waiting for it to complete.`);
    await new Promise((resolve) => {
      const poll = setInterval(() => {
        if (!inFlight.has(number)) {
          clearInterval(poll);
          resolve();
        }
      }, 500);
      setTimeout(() => { clearInterval(poll); resolve(); }, 60000);
    });
  }

  let code = null;
  inFlight.add(number);
  try {
    try {
      code = await sock.requestPairingCode(number);
    } catch (e) {
      console.warn(`[pairing] First attempt for ***${String(number).slice(-3)} failed (${e.message}). Waiting for the socket to be ready, then retrying once...`);
    }

    if (!code) {
      // Socket not ready yet — wait for a QR-bearing update, then retry once
      try {
        await new Promise((resolve) => {
          let settled = false;
          const timeout = setTimeout(() => { settled = true; resolve(); }, CONNECTION_READY_TIMEOUT_MS);
          try {
            sock.waitForConnectionUpdate(u => {
              if (settled) return true;
              if (u.qr) { clearTimeout(timeout); settled = true; resolve(); return true; }
              return false;
            }).catch(() => {});
          } catch (e) {
            clearTimeout(timeout);
            resolve();
          }
        });
        if (!isSessionRegistered(sock)) {
          await new Promise(resolve => setTimeout(resolve, PAIRING_RETRY_WAIT_MS));
          code = await sock.requestPairingCode(number);
        } else {
          throw new Error(`Session became registered during pairing (${sock.user.id.split(':')[0]}). Pairing skipped.`);
        }
      } catch (e) {
        if (e.message && e.message.startsWith('Session became registered')) throw e;
        throw new Error(`Pairing failed for ${number}: ${e.message}`);
      }
    }

    if (!code) {
      throw new Error(`Pairing failed for ${number}: WhatsApp did not return a code. The socket may not be ready — restart the bot and try again.`);
    }

    return { code, number };
  } finally {
    inFlight.delete(number);
  }
}

/**
 * Attempt pairing from a startup context, logging results clearly.
 * Used by the connection event when a pending pairing number exists.
 * On failure the caller may restore the pending number for a later retry.
 */
async function tryRequestPairing(sock, number) {
  try {
    const { code } = await requestPairingCode(sock, number);
    console.log(`\n[pairing] Pairing code: ${code}`);
    console.log('Enter this code in WhatsApp > Linked Devices > Link a Device\n');
    return { ok: true, code };
  } catch (e) {
    console.error(`\n[pairing] ${e.message}`);
    return { ok: false, error: e.message };
  }
}

module.exports = { normalizePhoneNumber, isSessionRegistered, requestPairingCode, tryRequestPairing };
