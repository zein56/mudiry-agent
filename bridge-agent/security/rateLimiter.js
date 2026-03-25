class RateLimiter {
  constructor(options, logger) {
    this.windowMs = options?.windowMs || 10000;
    this.max = options?.max || 100;
    this.logger = logger;
    this.counters = new Map();
  }

  allow(key) {
    const now = Date.now();
    const entry = this.counters.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.counters.set(key, { windowStart: now, count: 1 });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count += 1;
    return true;
  }
}

module.exports = { RateLimiter };
