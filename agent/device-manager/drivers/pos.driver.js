"use strict";

class PosDriver {
  constructor({ device, logger }) {
    this.device = device;
    this.logger = logger;
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    this.logger.debug("POS driver connected", { deviceId: this.device.id });
  }

  async send(command) {
    const action = command?.action || "unknown";
    this.logger.info("POS driver command", { deviceId: this.device.id, action });
    return { ok: true, message: "pos driver placeholder" };
  }

  async disconnect() {
    this.connected = false;
  }
}

module.exports = PosDriver;
