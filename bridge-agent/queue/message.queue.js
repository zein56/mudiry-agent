class MessageQueue {
  constructor(options, logger) {
    this.maxPerClient = options?.maxPerClient || 500;
    this.maxUpstream = options?.maxUpstream || 5000;
    this.logger = logger;
    this.clientQueues = new Map();
    this.upstreamQueue = [];
  }

  enqueueForClient(clientId, message) {
    if (!this.clientQueues.has(clientId)) {
      this.clientQueues.set(clientId, []);
    }
    const queue = this.clientQueues.get(clientId);
    queue.push(message);
    if (queue.length > this.maxPerClient) {
      queue.shift();
      if (this.logger) this.logger.warn({ clientId }, 'Client queue full, dropping oldest message');
    }
  }

  drainForClient(clientId) {
    const queue = this.clientQueues.get(clientId) || [];
    this.clientQueues.delete(clientId);
    return queue;
  }

  enqueueUpstream(message) {
    this.upstreamQueue.push(message);
    if (this.upstreamQueue.length > this.maxUpstream) {
      this.upstreamQueue.shift();
      if (this.logger) this.logger.warn('Upstream queue full, dropping oldest message');
    }
  }

  drainUpstream() {
    const queue = this.upstreamQueue;
    this.upstreamQueue = [];
    return queue;
  }
}

module.exports = { MessageQueue };
