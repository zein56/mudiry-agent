const { EventEmitter } = require('events');
const { WebSocketServer } = require('ws');
const { parseJson, validateClientMessage } = require('../validator');
const { validateClientId } = require('../security/auth');

class DownstreamServer extends EventEmitter {
  constructor({ config, connectionManager, rateLimiter, logger }) {
    super();
    this.config = config;
    this.connectionManager = connectionManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.wss = null;
    this.heartbeatInterval = null;
  }

  start() {
    const { host, port, path } = this.config.downstream;
    const maxPayload = this.config.security.messageSizeLimit;

    this.wss = new WebSocketServer({
      host,
      port,
      path,
      maxPayload,
      clientTracking: false
    });

    this.wss.on('connection', (ws, req) => {
      const maxConnections = this.config.downstream.maxConnections;
      if (this.connectionManager.getAll().length >= maxConnections) {
        ws.close(1013, 'Server busy');
        return;
      }

      const url = new URL(req.url, 'http://localhost');
      const clientId = url.searchParams.get('clientId');

      if (!validateClientId(clientId, this.config)) {
        this.logger.warn({ clientId }, 'Invalid clientId');
        ws.close(1008, 'Invalid clientId');
        return;
      }

      const existing = this.connectionManager.getClient(clientId);
      if (existing && existing.ws && existing.ws.readyState === 1) {
        existing.ws.close(4000, 'Replaced by new connection');
        this.connectionManager.removeClient(clientId, 'replaced');
      }

      ws.clientId = clientId;
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
        this.connectionManager.updateHeartbeat(clientId);
      });

      ws.on('message', async (data, isBinary) => {
        if (isBinary) {
          ws.close(1003, 'Binary not supported');
          return;
        }

        if (!this.rateLimiter.allow(clientId)) {
          ws.close(1013, 'Rate limit');
          return;
        }

        const message = parseJson(data, this.logger);
        if (!validateClientMessage(message)) {
          this.logger.warn({ clientId }, 'Invalid client message');
          return;
        }

        this.emit('message', { clientId, message });
      });

      ws.on('close', (code, reason) => {
        this.connectionManager.removeClient(clientId, { code, reason: reason?.toString() });
        this.logger.info({ clientId, code }, 'Client disconnected');
      });

      ws.on('error', (err) => {
        this.logger.error({ clientId, err }, 'Client error');
      });

      this.connectionManager.addClient(clientId, ws);
      this.logger.info({ clientId }, 'Client connected');
    });

    this._startHeartbeat();
    this.logger.info({ host, port }, 'Downstream server started');
  }

  _startHeartbeat() {
    const intervalMs = this.config.heartbeat.intervalMs;
    const timeoutMs = this.config.heartbeat.timeoutMs;

    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const entry of this.connectionManager.getAll()) {
        const ws = entry.ws;
        if (!ws || ws.readyState !== 1) continue;

        const last = entry.lastHeartbeat || 0;
        if (!ws.isAlive || (now - last > timeoutMs)) {
          ws.terminate();
          this.connectionManager.removeClient(entry.clientId, 'heartbeat-timeout');
          this.logger.warn({ clientId: entry.clientId }, 'Client heartbeat timeout');
          continue;
        }

        ws.isAlive = false;
        ws.ping();
      }
    }, intervalMs);

    this.heartbeatInterval.unref();
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (!this.wss) return Promise.resolve();

    for (const entry of this.connectionManager.getAll()) {
      try {
        entry.ws.close();
      } catch (_) {
        // ignore
      }
    }

    return new Promise((resolve) => {
      this.wss.close(() => resolve());
    });
  }
}

module.exports = { DownstreamServer };
