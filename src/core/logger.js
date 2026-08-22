/**
 * Console & Baileys logger suppression
 * Filters session/ratchet noise from logs while keeping useful output short.
 */

const forbiddenPatterns = [
  'closing session', 'closing open session', 'sessionentry',
  'prekey bundle', 'pendingprekey', '_chains', 'registrationid',
  'currentratchet', 'chainkey', 'ratchet', 'signal protocol',
  'ephemeralkeypair', 'indexinfo', 'basekey', 'ratchetkey'
];

const shouldSuppress = (args) => {
  const message = args.map(a =>
    typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)
  ).join(' ').toLowerCase();
  return forbiddenPatterns.some(pattern => message.includes(pattern));
};

/**
 * Override console.log/error/warn to drop session-crypto noise.
 */
function installConsoleSuppression() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args) => {
    if (!shouldSuppress(args)) originalLog.apply(console, args);
  };
  console.error = (...args) => {
    if (!shouldSuppress(args)) originalError.apply(console, args);
  };
  console.warn = (...args) => {
    if (!shouldSuppress(args)) originalWarn.apply(console, args);
  };
}

/**
 * Build a Baileys-compatible logger that never prints crypto noise.
 */
function createSuppressedLogger(level = 'silent') {
  let pino;
  try {
    pino = require('pino');
  } catch (e) {
    pino = null;
  }

  if (!pino) {
    return {
      info: () => {}, debug: () => {}, trace: () => {},
      warn: () => {}, error: () => {}, fatal: () => {},
      child: () => createSuppressedLogger('silent'), level: 'silent'
    };
  }

  let logger;
  try {
    logger = pino({
      level,
      transport: process.env.NODE_ENV === 'production' ? undefined : {
        target: 'pino-pretty',
        options: { colorize: true, ignore: 'pid,hostname' }
      },
      customLevels: { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 },
      redact: ['registrationId', 'ephemeralKeyPair', 'rootKey', 'chainKey', 'baseKey']
    });
  } catch (err) {
    logger = pino({ level });
  }

  const originalInfo = logger.info.bind(logger);
  logger.info = (...args) => {
    if (!shouldSuppress(args)) originalInfo(...args);
  };
  logger.debug = () => {};
  logger.trace = () => {};
  return logger;
}

module.exports = { installConsoleSuppression, createSuppressedLogger, shouldSuppress };
