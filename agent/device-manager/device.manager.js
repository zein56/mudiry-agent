"use strict";

const DeviceRegistry = require("./device.registry");
const DeviceFactory = require("./device.factory");
const StorageService = require("../services/storage.service");
const { validateDevicePayload, normalizeDevice } = require("../core/validator");

class DeviceManager {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.registry = new DeviceRegistry();
    this.factory = new DeviceFactory({ config, logger });
    this.storage = new StorageService({ filePath: config.storagePath, logger });
    this.drivers = new Map();
  }

  async loadFromStorage() {
    const data = await this.storage.load();
    const devices = Array.isArray(data.devices) ? data.devices : [];

    for (const device of devices) {
      const validation = validateDevicePayload(device, this.config);
      if (!validation.ok) {
        this.logger.warn("Skipping invalid stored device", {
          deviceId: device?.id,
          errors: validation.errors
        });
        continue;
      }
      const normalized = normalizeDevice(device);
      this.registry.add(normalized);
    }

    this.logger.info("Loaded devices from storage", { count: this.registry.size() });
  }

  async persist() {
    const devices = this.registry.list();
    await this.storage.save({ devices });
  }

  async addDevice(device) {
    const validation = validateDevicePayload(device, this.config);
    if (!validation.ok) {
      return { ok: false, error: "validation_failed", details: validation.errors };
    }

    if (this.registry.has(device.id)) {
      return { ok: false, error: "device_exists" };
    }

    const maxDevices = this.config.maxDevices;
    if (typeof maxDevices === "number" && maxDevices > 0 && this.registry.size() >= maxDevices) {
      return { ok: false, error: "device_limit_reached" };
    }

    const normalized = normalizeDevice(device);
    this.registry.add(normalized);

    try {
      await this.persist();
    } catch (err) {
      this.registry.remove(normalized.id);
      this.logger.error("Failed to persist device add", { error: err.message });
      return { ok: false, error: "storage_error" };
    }

    this.logger.info("Device added", { deviceId: normalized.id, type: normalized.type });
    return { ok: true, device: normalized };
  }

  async removeDevice(id) {
    if (!this.registry.has(id)) {
      return { ok: false, error: "device_not_found" };
    }

    this.registry.remove(id);

    const driver = this.drivers.get(id);
    if (driver) {
      try {
        await driver.disconnect();
      } catch (err) {
        this.logger.warn("Driver disconnect failed", { deviceId: id, error: err.message });
      }
      this.drivers.delete(id);
    }

    try {
      await this.persist();
    } catch (err) {
      this.logger.error("Failed to persist device removal", { error: err.message });
      return { ok: false, error: "storage_error" };
    }

    this.logger.info("Device removed", { deviceId: id });
    return { ok: true };
  }

  listDevices() {
    return this.registry.list();
  }

  getDevice(id) {
    return this.registry.get(id);
  }

  async getDriverForDevice(device) {
    const existing = this.drivers.get(device.id);
    if (existing) return existing;
    const driver = this.factory.create(device);
    this.drivers.set(device.id, driver);
    return driver;
  }

  async executeCommand({ deviceId, action, payload, requestId }) {
    if (!deviceId || typeof deviceId !== "string") {
      return { ok: false, error: "device_id_required" };
    }

    const device = this.registry.get(deviceId);
    if (!device) {
      this.logger.warn("Command for missing device", { deviceId, action, requestId });
      return { ok: false, error: "device_not_found" };
    }

    const testMode = global.APP_MODE?.isTestMode === true || process.env.TEST_MODE === "true";
    if (testMode) {
      this.logger.info("🧪 TEST MODE: device command simulated", { deviceId, action, requestId });
      return {
        ok: true,
        simulated: true,
        result: {
          success: true,
          simulated: true,
          message: "Test mode - no real device communication"
        }
      };
    }

    let driver;
    try {
      driver = await this.getDriverForDevice(device);
    } catch (err) {
      this.logger.error("Driver creation failed", { deviceId, error: err.message });
      return { ok: false, error: "driver_error" };
    }

    try {
      if (typeof driver.connect === "function") {
        await driver.connect();
      }
      const result = await driver.send({ action, payload });
      this.logger.info("Device command executed", { deviceId, action, requestId });
      return { ok: true, result: result ?? null };
    } catch (err) {
      this.logger.error("Device command failed", { deviceId, action, error: err.message, requestId });
      return { ok: false, error: "command_failed", message: err.message };
    } finally {
      const autoDisconnect = this.config.device?.autoDisconnect;
      if (autoDisconnect && driver && typeof driver.disconnect === "function") {
        try {
          await driver.disconnect();
        } catch (err) {
          this.logger.warn("Auto-disconnect failed", { deviceId, error: err.message });
        }
      }
    }
  }

  async shutdown() {
    for (const [id, driver] of this.drivers.entries()) {
      try {
        if (typeof driver.disconnect === "function") await driver.disconnect();
      } catch (err) {
        this.logger.warn("Driver disconnect failed during shutdown", { deviceId: id, error: err.message });
      }
    }
    this.drivers.clear();
  }
}

module.exports = DeviceManager;
