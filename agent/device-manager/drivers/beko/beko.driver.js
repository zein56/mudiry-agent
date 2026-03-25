"use strict";

const { BekoService } = require("./beko.service");
const { BekoBridge } = require("./beko.bridge");

const MAX_RETRIES = 3;
const SENSITIVE_KEYS = [
  "token",
  "authorization",
  "auth",
  "password",
  "secret",
  "apikey",
  "api_key",
  "pin",
  "pan",
  "card",
  "cvv",
  "cvc",
  "track1",
  "track2"
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function shouldRedactKey(key) {
  const lower = String(key).toLowerCase();
  return SENSITIVE_KEYS.some((needle) => lower === needle || lower.includes(needle));
}

function redactValue(value, depth = 0) {
  if (depth > 6) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (isPlainObject(value)) {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = shouldRedactKey(key) ? "[REDACTED]" : redactValue(val, depth + 1);
    }
    return result;
  }
  return value;
}

class BekoDriver {
  constructor({ device, logger, config }) {
    this.device = device;
    this.logger = logger;
    this.config = config;
    this.connected = false;

    this.service = new BekoService({ device, logger });
    this.bridge = new BekoBridge({ device, logger, config });
  }

  async connect() {
    if (this.connected) return;
    if (typeof this.bridge.connect === "function") {
      await this.bridge.connect();
    }
    this.connected = true;
    if (this.logger?.debug) {
      this.logger.debug("Beko driver connected", { deviceId: this.device.id });
    }
  }

  async send(command) {
    const action = command?.action;
    const payload = command?.payload;

    if (!this.connected) await this.connect();

    const request = this.service.buildRequest(action, payload);
    const safeRequest = redactValue(request);

    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (this.logger?.debug) {
        this.logger.debug("Beko command outgoing", {
          deviceId: this.device.id,
          action: request.action,
          attempt,
          request: safeRequest
        });
      }

      try {
        const response = await this.bridge.send(request);
        const normalized = this.service.normalizeResponse(action, response);

        if (this.logger?.debug) {
          this.logger.debug("Beko command success", {
            deviceId: this.device.id,
            action: request.action,
            attempt,
            response: redactValue(normalized)
          });
        }

        return normalized;
      } catch (err) {
        lastError = err;
        if (this.logger?.error) {
          this.logger.error("Beko command failed", {
            deviceId: this.device.id,
            action: request.action,
            attempt,
            message: err?.message || String(err)
          });
        }
        if (attempt >= MAX_RETRIES) break;
      }
    }

    throw lastError || new Error("Beko command failed");
  }

  async disconnect() {
    if (typeof this.bridge.disconnect === "function") {
      await this.bridge.disconnect();
    }
    this.connected = false;
  }
}

module.exports = BekoDriver;
