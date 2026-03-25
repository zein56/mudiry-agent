"use strict";

class DeviceRegistry {
  constructor() {
    this.devices = new Map();
  }

  add(device) {
    this.devices.set(device.id, device);
  }

  remove(id) {
    return this.devices.delete(id);
  }

  get(id) {
    return this.devices.get(id);
  }

  has(id) {
    return this.devices.has(id);
  }

  list() {
    return Array.from(this.devices.values());
  }

  size() {
    return this.devices.size;
  }
}

module.exports = DeviceRegistry;
