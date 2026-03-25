"use strict";

let escpos;
try {
  escpos = require("escpos");
  escpos.Network = require("escpos-network");
} catch (err) {
  escpos = null;
}

function toRawBuffer(payload) {
  if (Buffer.isBuffer(payload)) return payload;
  if (Array.isArray(payload)) return Buffer.from(payload);
  if (typeof payload === "string") return Buffer.from(payload, "binary");
  if (payload && typeof payload === "object") {
    if (Buffer.isBuffer(payload.data)) return payload.data;
    if (Array.isArray(payload.data)) return Buffer.from(payload.data);
    if (typeof payload.data === "string") {
      const encoding = payload.encoding || "base64";
      return Buffer.from(payload.data, encoding);
    }
  }
  throw new Error("Invalid raw payload for printer");
}

function toPrintLines(payload) {
  if (payload === undefined || payload === null) return [];
  if (typeof payload === "string") return [payload];
  if (Array.isArray(payload)) return payload.map((line) => String(line));
  if (typeof payload === "object") {
    if (Array.isArray(payload.lines)) return payload.lines.map((line) => String(line));
    if (typeof payload.text === "string") return [payload.text];
  }
  return [];
}

class PrinterDriver {
  constructor({ device, logger, config }) {
    this.device = device;
    this.logger = logger;
    this.config = config;
    this.deviceHandle = null;
    this.printer = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    if (!escpos) throw new Error("escpos modules are not available");

    const connection = this.device.connection || {};
    if (connection.type !== "network") {
      throw new Error(`Unsupported printer connection type: ${connection.type}`);
    }

    const ip = connection.ip || connection.host;
    if (!ip) throw new Error("Printer connection requires ip or host");

    const port = connection.port || 9100;
    const Network = escpos.Network;
    if (!Network) throw new Error("escpos-network is not available");

    this.deviceHandle = new Network(ip, port);
    this.printer = new escpos.Printer(this.deviceHandle);

    await new Promise((resolve, reject) => {
      this.deviceHandle.open((err) => {
        if (err) return reject(err);
        this.connected = true;
        resolve();
      });
    });
  }

  async send(command) {
    const { action, payload } = command || {};
    if (!this.connected) await this.connect();
    if (!this.printer) throw new Error("Printer not initialized");

    if (action === "raw") {
      const buffer = toRawBuffer(payload);
      this.printer.raw(buffer);
    } else {
      const lines = toPrintLines(payload);
      if (lines.length === 0) throw new Error("Printer payload is empty");
      lines.forEach((line) => this.printer.text(line));
      if (!payload || payload.cut !== false) this.printer.cut();
    }

    return { ok: true };
  }

  async disconnect() {
    if (!this.deviceHandle) {
      this.connected = false;
      return;
    }

    await new Promise((resolve) => {
      try {
        if (typeof this.deviceHandle.close === "function") {
          const maybeCallback = this.deviceHandle.close.length > 0;
          if (maybeCallback) {
            this.deviceHandle.close(() => resolve());
            setTimeout(resolve, 500);
          } else {
            this.deviceHandle.close();
            resolve();
          }
        } else {
          resolve();
        }
      } catch (err) {
        resolve();
      }
    });

    this.connected = false;
    this.deviceHandle = null;
    this.printer = null;
  }
}

module.exports = PrinterDriver;
