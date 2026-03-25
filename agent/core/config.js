"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = {
  http: {
    host: "127.0.0.1",
    port: 7070
  },
  ws: {
    enabled: false,
    url: "",
    authToken: "",
    reconnect: {
      minDelayMs: 1000,
      maxDelayMs: 15000
    }
  },
  storagePath: "./storage/device.store.json",
  maxDevices: 200,
  logging: {
    level: "info"
  },
  device: {
    autoConnect: false,
    autoDisconnect: true
  },
  security: {
    allowedDeviceTypes: ["printer", "cash", "pos"],
    allowedConnectionTypes: ["network", "usb", "serial", "local", "sdk"]
  }
};

function deepMerge(target, source) {
  if (!source) return target;
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.toLowerCase() === "true" || value === "1";
}

function loadConfig(configPath) {
  let fileConfig = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8");
    if (raw.trim()) {
      fileConfig = JSON.parse(raw);
    }
  }

  const config = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), fileConfig);

  if (process.env.AGENT_HTTP_HOST) config.http.host = process.env.AGENT_HTTP_HOST;
  if (process.env.AGENT_HTTP_PORT) config.http.port = Number(process.env.AGENT_HTTP_PORT);
  if (process.env.AGENT_WS_URL) config.ws.url = process.env.AGENT_WS_URL;
  if (process.env.AGENT_WS_ENABLED) config.ws.enabled = toBoolean(process.env.AGENT_WS_ENABLED);
  if (process.env.AGENT_MAX_DEVICES) config.maxDevices = Number(process.env.AGENT_MAX_DEVICES);
  if (process.env.AGENT_STORAGE_PATH) config.storagePath = process.env.AGENT_STORAGE_PATH;

  if (Number.isNaN(config.http.port)) config.http.port = DEFAULT_CONFIG.http.port;
  if (Number.isNaN(config.maxDevices)) config.maxDevices = DEFAULT_CONFIG.maxDevices;

  config.storagePath = path.resolve(path.dirname(configPath), config.storagePath);

  return config;
}

module.exports = {
  loadConfig
};
