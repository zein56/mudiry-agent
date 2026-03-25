const { sendJson } = require('../utils/ws');
const { validateUpstreamMessage, validateClientMessage } = require('../validator');
const { validateUpstreamMessageToken } = require('../security/auth');

class MessageRouter {
  constructor({ config, upstream, downstream, connectionManager, queue, logger }) {
    this.config = config;
    this.upstream = upstream;
    this.downstream = downstream;
    this.connectionManager = connectionManager;
    this.queue = queue;
    this.logger = logger;
  }

  start() {
    this.upstream.on('message', (message) => this._handleUpstreamMessage(message));
    this.downstream.on('message', ({ clientId, message }) => this._handleDownstreamMessage(clientId, message));
    this.upstream.on('connected', () => this._flushUpstreamQueue());
    this.connectionManager.on('clientConnected', (clientId) => this._flushClientQueue(clientId));
  }

  async _handleUpstreamMessage(message) {
    if (!validateUpstreamMessage(message)) {
      this.logger.warn('Invalid upstream message');
      return;
    }

    if (!validateUpstreamMessageToken(message, this.config)) {
      this.logger.warn('Upstream token invalid');
      return;
    }

    const targetClientId = message.targetClientId;
    if (!targetClientId || typeof targetClientId !== 'string') {
      this.logger.warn('Upstream message missing targetClientId');
      return;
    }

    if (targetClientId === '*') {
      for (const entry of this.connectionManager.getAll()) {
        await this._sendToClient(entry.clientId, message);
      }
      return;
    }

    await this._sendToClient(targetClientId, message);
  }

  async _handleDownstreamMessage(clientId, message) {
    if (!validateClientMessage(message)) {
      this.logger.warn({ clientId }, 'Invalid downstream message');
      return;
    }

    const upstreamMessage = {
      ...message,
      sourceClientId: clientId,
      bridgeId: this.config.upstream.bridgeId,
      bridgeToken: this.config.upstream.token
    };

    if (this.upstream.isConnected) {
      try {
        await this.upstream.send(upstreamMessage);
      } catch (err) {
        this.logger.error({ err }, 'Upstream send failed, queueing');
        this.queue.enqueueUpstream(upstreamMessage);
      }
    } else {
      this.queue.enqueueUpstream(upstreamMessage);
    }
  }

  async _sendToClient(clientId, message) {
    const entry = this.connectionManager.getClient(clientId);
    if (!entry || !entry.ws || entry.ws.readyState !== 1) {
      this.queue.enqueueForClient(clientId, message);
      return;
    }

    const safeMessage = { ...message };
    if ('bridgeToken' in safeMessage) delete safeMessage.bridgeToken;

    try {
      await sendJson(entry.ws, safeMessage);
    } catch (err) {
      this.logger.error({ err, clientId }, 'Client send failed, queueing');
      this.queue.enqueueForClient(clientId, message);
    }
  }

  async _flushClientQueue(clientId) {
    const messages = this.queue.drainForClient(clientId);
    if (!messages.length) return;

    for (const message of messages) {
      await this._sendToClient(clientId, message);
    }
  }

  async _flushUpstreamQueue() {
    const messages = this.queue.drainUpstream();
    if (!messages.length) return;

    for (const message of messages) {
      try {
        await this.upstream.send(message);
      } catch (err) {
        this.logger.error({ err }, 'Upstream flush failed, re-queueing');
        this.queue.enqueueUpstream(message);
        break;
      }
    }
  }
}

module.exports = { MessageRouter };
