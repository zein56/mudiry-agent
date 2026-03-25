const { EventEmitter } = require('events');
const WebSocket = require('ws');
const { parseJson } = require('../validator');

class UpstreamClient extends EventEmitter {
  constructor({ config, logger }) {
    super();
    this.config = config;
    this.logger = logger;
    this.ws = null;
    this.isConnected = false;
    this.isAlive = false;
    this.reconnectTimer = null;
    this.currentDelay = this.config.upstream.reconnect.minDelayMs;
    this.heartbeatInterval = null;
    this.shouldReconnect = true;
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.shouldReconnect = true;
    this._connectInternal();
  }

  _connectInternal() {
    const { url, token, bridgeId, handshakeTimeoutMs } = this.config.upstream;
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-bridge-id': bridgeId
    };

    this.logger.info({ url }, 'Connecting to upstream');

    this.ws = new WebSocket(url, {
      headers,
      handshakeTimeout: handshakeTimeoutMs,
      maxPayload: this.config.security.messageSizeLimit
    });

    this.ws.on('open', () => {
      this.isConnected = true;
      this.isAlive = true;
      this._resetBackoff();
      this._startHeartbeat();
      this._sendAuth();
      this.emit('connected');
      this.logger.info('Upstream connected');
    });

    this.ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const message = parseJson(data, this.logger);
      if (!message) return;
      this.emit('message', message);
    });

    this.ws.on('pong', () => {
      this.isAlive = true;
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      this._stopHeartbeat();
      this.emit('disconnected', { code, reason: reason?.toString() });
      this.logger.warn({ code }, 'Upstream disconnected');
      if (this.shouldReconnect) this._scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.logger.error({ err }, 'Upstream error');
    });
  }

  _sendAuth() {
    const message = {
      type: 'bridge_auth',
      bridgeId: this.config.upstream.bridgeId,
      token: this.config.upstream.token
    };
    this.send(message).catch((err) => {
      this.logger.error({ err }, 'Failed to send auth');
    });
  }

  _startHeartbeat() {
    const intervalMs = this.config.heartbeat.intervalMs;
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== 1) return;
      if (!this.isAlive) {
        this.ws.terminate();
        return;
      }
      this.isAlive = false;
      this.ws.ping();
    }, intervalMs);

    this.heartbeatInterval.unref();
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = this._nextDelay();
    this.logger.warn({ delay }, 'Reconnecting to upstream');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connectInternal();
    }, delay);
  }

  _nextDelay() {
    const { maxDelayMs, factor, jitter } = this.config.upstream.reconnect;
    const base = Math.min(this.currentDelay * factor, maxDelayMs);
    const jitterAmount = base * jitter * Math.random();
    this.currentDelay = base;
    return base + jitterAmount;
  }

  _resetBackoff() {
    this.currentDelay = this.config.upstream.reconnect.minDelayMs;
  }

  async send(message) {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error('Upstream not connected');
    }
    return new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(message), (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) this.ws.close();
  }
}

module.exports = { UpstreamClient };
