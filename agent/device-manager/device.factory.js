"use strict";

const PrinterDriver = require("./drivers/printer.driver");
const CashDriver = require("./drivers/cash.driver");
const PosDriver = require("./drivers/pos.driver");
const BekoDriver = require("./drivers/beko/beko.driver");

function isBekoDevice(device) {
  return device?.meta?.model === "beko-x30tr";
}

class DeviceFactory {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
  }

  create(device) {
    switch (device.type) {
      case "printer":
        return new PrinterDriver({ device, logger: this.logger, config: this.config });
      case "cash":
        return new CashDriver({ device, logger: this.logger, config: this.config });
      case "pos":
        if (isBekoDevice(device)) {
          return new BekoDriver({ device, logger: this.logger, config: this.config });
        }
        return new PosDriver({ device, logger: this.logger, config: this.config });
      default:
        throw new Error(`Unsupported device type: ${device.type}`);
    }
  }
}

module.exports = DeviceFactory;
