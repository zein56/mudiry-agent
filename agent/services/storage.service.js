"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

class StorageService {
  constructor({ filePath, logger }) {
    this.filePath = filePath;
    this.logger = logger;
  }

  async ensureFile() {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      await fsp.writeFile(this.filePath, JSON.stringify({ devices: [] }, null, 2));
    }
  }

  async load() {
    await this.ensureFile();
    const raw = await fsp.readFile(this.filePath, "utf8");
    if (!raw.trim()) return { devices: [] };
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || !Array.isArray(data.devices)) {
        this.logger.warn("Storage file invalid, resetting", { file: this.filePath });
        return { devices: [] };
      }
      return data;
    } catch (err) {
      this.logger.error("Failed to parse storage file, resetting", { error: err.message });
      return { devices: [] };
    }
  }

  async save(data) {
    await this.ensureFile();
    const safe = {
      devices: Array.isArray(data.devices) ? data.devices : []
    };
    await fsp.writeFile(this.filePath, JSON.stringify(safe, null, 2));
  }
}

module.exports = StorageService;
