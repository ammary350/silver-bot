/**
 * WhatsApp MD Bot - Main Entry Point (thin)
 * All logic lives in src/ (see src/startup/bootstrap.js).
 */
process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

const bootstrap = require('./src/startup/bootstrap');

bootstrap.main();

module.exports = {
  store: bootstrap.store,
  requestPairingCode: bootstrap.requestPairingCode,
  gracefulShutdown: bootstrap.gracefulShutdown
};

global.requestPairingCode = bootstrap.requestPairingCode;
