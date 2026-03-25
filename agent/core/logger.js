"use strict";

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function createLogger(options = {}) {
  const levelName = (options.level || "info").toLowerCase();
  const threshold = LEVELS[levelName] ?? LEVELS.info;

  function log(level, message, meta) {
    if ((LEVELS[level] ?? 0) < threshold) return;
    const time = new Date().toISOString();
    if (meta !== undefined) {
      console.log(`[${time}] [${level.toUpperCase()}] ${message}`, meta);
    } else {
      console.log(`[${time}] [${level.toUpperCase()}] ${message}`);
    }
  }

  return {
    debug: (msg, meta) => log("debug", msg, meta),
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta)
  };
}

module.exports = {
  createLogger
};
