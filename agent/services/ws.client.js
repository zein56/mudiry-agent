"use strict";

const EventEmitter = require("events");
const WebSocket = require("ws");

class WsClient extends EventEmitter {
  constructor({ config, logger }) {
    super();
    this.config = config;
    this.logger = logger;
    this.ws = null;
    this.shouldReconnect = true;
    this.reconnectDelay = config?.reconnect?.minDelayMs ?? 1000;
  }

  connect() {
    if (!this.config?.url) {
      throw new Error("WebSocket URL is required");
    }
    this.shouldReconnect = true;
    this._connect();
  }

  _connect() {
    this.logger.info("Connecting WebSocket", { url: this.config.url });
    const headers = {};
    if (this.config.authToken) {
      headers.Authorization = `Bearer ${this.config.authToken}`;
    }

    const ws = new WebSocket(this.config.url, { headers });
    this.ws = ws;

    ws.on("open", () => {
      this.logger.info("WebSocket connected");
      this.reconnectDelay = this.config?.reconnect?.minDelayMs ?? 1000;
      this.emit("connected");
    });

    ws.on("message", (data) => {
      this.emit("raw", data);
      let parsed;
      try {
        const text = typeof data === "string" ? data : data.toString();
        parsed = JSON.parse(text);
      } catch (err) {
        this.logger.warn("WebSocket message is not JSON");
        return;
      }
      this.emit("message", parsed);
    });

    ws.on("close", (code, reason) => {
      this.logger.warn("WebSocket closed", { code, reason: reason?.toString?.() });
      this.emit("disconnected");
      if (this.shouldReconnect) this._scheduleReconnect();
    });

    ws.on("error", (err) => {
      this.logger.error("WebSocket error", { error: err.message });
      this.emit("error", err);
    });
  }

  _scheduleReconnect() {
    const minDelay = this.config?.reconnect?.minDelayMs ?? 1000;
    const maxDelay = this.config?.reconnect?.maxDelayMs ?? 15000;
    const delay = Math.min(Math.max(this.reconnectDelay, minDelay), maxDelay);
    this.reconnectDelay = Math.min(delay * 2, maxDelay);

    this.logger.info("WebSocket reconnect scheduled", { delayMs: delay });
    setTimeout(() => {
      if (this.shouldReconnect) this._connect();
    }, delay);
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.ws.send(data);
  }

  async disconnect() {
    this.shouldReconnect = false;
    if (!this.ws) return;
    await new Promise((resolve) => {
      try {
        this.ws.once("close", () => resolve());
        this.ws.close();
      } catch (err) {
        resolve();
      }
    });
  }
}

module.exports = {
  WsClient
};
