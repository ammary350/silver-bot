/**
 * Interactive startup input — pairing menu and phone number prompt.
 * Supports headless VPS operation via the PAIRING_NUMBER env var.
 */

const fs = require('fs');
const pairing = require('../features/pairing/pairing');

async function showInteractiveMenu(validation, sessionFolder) {
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const hasSession = fs.existsSync(sessionFolder) && fs.readdirSync(sessionFolder).some(f => f.endsWith('.json'));

    console.log('\n═══════════════════════════════════════');
    console.log('       SILVER BOT STARTUP MENU');
    console.log('═══════════════════════════════════════');

    if (hasSession) {
      if (validation.valid) {
        console.log('  [1] Normal Start  (use saved session)');
      } else {
        console.log('  [1] Normal Start  (session INVALID, will show QR)');
        console.log(`      Reason: ${validation.reason}`);
      }
    }
    console.log('  [2] Pair a Number (request pairing code)');
    if (hasSession) console.log('  [3] Re-link Fresh (clear session & show QR)');
    console.log('═══════════════════════════════════════\n');

    const choices = hasSession ? '1-3' : '2';
    rl.question('Choose (' + choices + '): ', (answer) => {
      rl.close();
      const choice = answer.trim();
      if (choice === '1') resolve('normal');
      else if (choice === '2') resolve('pair');
      else if (choice === '3' && hasSession) resolve('relink');
      else {
        console.log('Invalid choice. Starting normally...');
        resolve('normal');
      }
    });
  });
}

/**
 * Get the pairing phone number:
 *  - uses PAIRING_NUMBER env when set (headless VPS, no prompts)
 *  - otherwise prompts on the terminal
 * Number is validated by pairing.normalizePhoneNumber (throws clear errors).
 */
async function getPairingNumber() {
  if (process.env.PAIRING_NUMBER) {
    const number = pairing.normalizePhoneNumber(process.env.PAIRING_NUMBER);
    console.log(`[startup] Using PAIRING_NUMBER from environment: ***${String(number).slice(-3)}`);
    return number;
  }

  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const ask = () => {
      rl.question('Enter phone number (with country code, e.g., 212722838422): ', (answer) => {
        try {
          const cleaned = pairing.normalizePhoneNumber(answer);
          rl.close();
          resolve(cleaned);
        } catch (e) {
          console.log(`[startup] ${e.message}`);
          ask();
        }
      });
    };
    ask();
  });
}

module.exports = { showInteractiveMenu, getPairingNumber };
