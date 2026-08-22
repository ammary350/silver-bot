/**
 * Credentials persistence — always save creds on creds.update.
 */

function registerCredsEvents(sock, ctx) {
  sock.ev.on('creds.update', async () => {
    if (!ctx.saveCreds) return;
    try {
      await ctx.saveCreds();
    } catch (e) {
      if (e.message?.includes('ENOSPC')) {
        console.error('[creds] No space left to save credentials.');
      } else if (!e.message?.includes('not-authorized')) {
        console.error('[creds] Failed to save credentials:', e.message);
      }
    }
  });
}

module.exports = { registerCredsEvents };
