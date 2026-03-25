"use strict";

const http = require("http");
const https = require("https");
const { URL } = require("url");
let WebSocket;

(function loadWS() {
  try {
    // Normal Node.js
    WebSocket = require("ws");
  } catch (e) {
    try {
      // pkg exe → exe'nin yanındaki node_modules
      const path = require("path");
      const base =
        process.pkg
          ? path.dirname(process.execPath)
          : process.cwd();

      WebSocket = require(path.join(base, "node_modules", "ws"));
    } catch (err) {
      console.error("WS LOAD FAILED:", err);
      throw err;
    }
  }
})();

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PORT = 8081;
const isTestMode = process.env.TEST_MODE === "true";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeTransport(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "websocket") return "ws";
  if (raw === "ws" || raw === "wss" || raw === "http" || raw === "https") return raw;
  return "http";
}

function normalizePath(pathValue) {
  if (!pathValue) return "/";
  if (typeof pathValue !== "string") return "/";
  return pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
}

function toPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return DEFAULT_PORT;
  return port;
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildUrl({ transport, host, port, path, clientId }) {
  const scheme = transport === "websocket" ? "ws" : transport;
  let url = `${scheme}://${host}:${port}${normalizePath(path)}`;
  if ((transport === "ws" || transport === "wss") && clientId) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}clientId=${encodeURIComponent(clientId)}`;
  }
  return url;
}

function resolveBridgeSettings(device, config) {
  const meta = isPlainObject(device?.meta) ? device.meta : {};
  const bridge = isPlainObject(meta.bridge) ? meta.bridge : {};
  const connection = isPlainObject(device?.connection) ? device.connection : {};

  const transport = normalizeTransport(
    bridge.transport || connection.transport || bridge.protocol || connection.protocol || config?.device?.bridge?.transport
  );

  const url = bridge.url || connection.url || null;
  const host = bridge.host || connection.host || connection.ip || "127.0.0.1";
  const port = toPort(bridge.port ?? connection.port ?? DEFAULT_PORT);
  const path = bridge.path || connection.path || "/";
  const timeoutMs = toNumber(bridge.timeoutMs ?? config?.device?.bridge?.timeoutMs ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const persistent = bridge.persistent !== undefined ? Boolean(bridge.persistent) : true;

  const headers = isPlainObject(bridge.headers) ? { ...bridge.headers } : {};
  const token = bridge.token || config?.device?.bridge?.token;
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;

  const clientId = bridge.clientId;

  return {
    transport,
    url: url || buildUrl({ transport, host, port, path, clientId }),
    timeoutMs,
    headers,
    persistent
  };
}

function parseJsonPayload(payload) {
  const text = Buffer.isBuffer(payload) ? payload.toString("utf8") : payload.toString();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("Invalid JSON response from bridge");
  }
}

class BekoBridge {
  constructor({ device, logger, config }) {
    this.device = device;
    this.logger = logger;
    this.config = config;

    const settings = resolveBridgeSettings(device, config);
    this.transport = settings.transport;
    this.url = settings.url;
    this.timeoutMs = settings.timeoutMs;
    this.headers = settings.headers;
    this.persistent = settings.persistent;

    this.ws = null;
    this.wsConnecting = null;
    this.wsQueue = Promise.resolve();
  }

  async connect() {
    if (this._isWs() && this.persistent) {
      await this._openWs();
    }
  }

  async send(command) {
    if (isTestMode) {
      return { ok: true, simulated: true };
    }
    if (this._isWs()) {
      return this._queueWs(() => this._sendWs(command));
    }
    return this._sendHttp(command);
  }

  async disconnect() {
    await this._closeWs();
  }

  _isWs() {
    return this.transport === "ws" || this.transport === "wss";
  }

  _queueWs(fn) {
    this.wsQueue = this.wsQueue.then(fn, fn);
    return this.wsQueue;
  }

  async _openWs() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws;
    if (this.wsConnecting) return this.wsConnecting;

    this.wsConnecting = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url, { headers: this.headers });

      const cleanup = () => {
        this.wsConnecting = null;
      };

      ws.on("open", () => {
        cleanup();
        this.ws = ws;
        resolve(ws);
      });

      ws.on("error", (err) => {
        cleanup();
        reject(err);
      });

      ws.on("close", () => {
        if (this.ws === ws) this.ws = null;
      });
    });

    return this.wsConnecting;
  }

  async _closeWs() {
    if (!this.ws) return;

    const ws = this.ws;
    this.ws = null;

    await new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) return resolve();
      ws.once("close", () => resolve());
      try {
        ws.close(1000, "client disconnect");
      } catch (_) {
        resolve();
      }
    });
  }

  async _sendWs(command) {
    const ws = await this._openWs();
    const response = await this._sendWsOnce(ws, command);
    if (!this.persistent) await this._closeWs();
    return response;
  }

  _sendWsOnce(ws, command) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.off("message", onMessage);
        ws.off("error", onError);
        ws.off("close", onClose);
      };

      const onMessage = (data) => {
        cleanup();
        try {
          resolve(parseJsonPayload(data));
        } catch (err) {
          reject(err);
        }
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      const onClose = () => {
        cleanup();
        reject(new Error("Bridge WS closed"));
      };

      const timer = setTimeout(() => {
        onError(new Error("Bridge WS timeout"));
      }, this.timeoutMs);

      ws.once("message", onMessage);
      ws.once("error", onError);
      ws.once("close", onClose);

      const payload = JSON.stringify(command);
      ws.send(payload, (err) => {
        if (err) onError(err);
      });
    });
  }

  _sendHttp(command) {
    const url = new URL(this.url);
    const body = JSON.stringify(command);
    const isHttps = url.protocol === "https:";
    const requestFn = isHttps ? https.request : http.request;

    const headers = {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
      ...this.headers
    };

    const options = {
      method: "POST",
      headers
    };

    return new Promise((resolve, reject) => {
      const req = requestFn(url, options, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");

          if (!text) {
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`Bridge HTTP ${res.statusCode}`));
            }
            return resolve({ status: "success" });
          }

          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch (err) {
            return reject(new Error("Invalid JSON response from bridge"));
          }

          if (res.statusCode && res.statusCode >= 400) {
            const message = parsed?.message || parsed?.error || `Bridge HTTP ${res.statusCode}`;
            return reject(new Error(message));
          }

          resolve(parsed);
        });
      });

      req.on("error", reject);
      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error("Bridge HTTP timeout"));
      });

      req.write(body);
      req.end();
    });
  }
}

module.exports = {
  BekoBridge
};
