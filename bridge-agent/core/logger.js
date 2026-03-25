const pino = require('pino');

function createLogger(config) {
  const level = (config && config.logLevel) || process.env.LOG_LEVEL || 'info';
  const base = { bridgeId: config?.upstream?.bridgeId };
  return pino({ level, base });
}

module.exports = { createLogger };
