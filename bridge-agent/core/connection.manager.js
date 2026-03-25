const { EventEmitter } = require('events');

class ConnectionManager extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.clients = new Map();
  }

  addClient(clientId, ws) {
    this.clients.set(clientId, {
      clientId,
      ws,
      status: 'connected',
      lastHeartbeat: Date.now()
    });
    this.emit('clientConnected', clientId);
  }

  removeClient(clientId, reason) {
    if (!this.clients.has(clientId)) return;
    this.clients.delete(clientId);
    this.emit('clientDisconnected', clientId, reason);
  }

  updateHeartbeat(clientId) {
    const entry = this.clients.get(clientId);
    if (entry) entry.lastHeartbeat = Date.now();
  }

  getClient(clientId) {
    return this.clients.get(clientId) || null;
  }

  isConnected(clientId) {
    const entry = this.clients.get(clientId);
    return Boolean(entry && entry.ws && entry.ws.readyState === 1);
  }

  listClients() {
    return Array.from(this.clients.keys());
  }

  getAll() {
    return Array.from(this.clients.values());
  }
}

module.exports = { ConnectionManager };
