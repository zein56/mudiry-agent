const fs = require('fs');
const path = require('path');

const { createLogger } = require('./core/logger');
const { UpstreamClient } = require('./core/upstream.client');
const { DownstreamServer } = require('./core/downstream.server');
const { ConnectionManager } = require('./core/connection.manager');
const { MessageQueue } = require('./queue/message.queue');
const { RateLimiter } = require('./security/rateLimiter');
const { MessageRouter } = require('./router/message.router');

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);

  if (process.env.UPSTREAM_URL) config.upstream.url = process.env.UPSTREAM_URL;
  if (process.env.UPSTREAM_TOKEN) config.upstream.token = process.env.UPSTREAM_TOKEN;
  if (process.env.BRIDGE_ID) config.upstream.bridgeId = process.env.BRIDGE_ID;
  if (process.env.DOWNSTREAM_PORT) config.downstream.port = Number(process.env.DOWNSTREAM_PORT);
  if (process.env.DOWNSTREAM_HOST) config.downstream.host = process.env.DOWNSTREAM_HOST;
  if (process.env.LOG_LEVEL) config.logLevel = process.env.LOG_LEVEL;

  return config;
}

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);

  const connectionManager = new ConnectionManager(logger);
  const messageQueue = new MessageQueue(config.queue, logger);
  const rateLimiter = new RateLimiter(config.security.rateLimit, logger);

  const downstream = new DownstreamServer({
    config,
    connectionManager,
    rateLimiter,
    logger
  });

  const upstream = new UpstreamClient({ config, logger });

  const router = new MessageRouter({
    config,
    upstream,
    downstream,
    connectionManager,
    queue: messageQueue,
    logger
  });

  router.start();
  downstream.start();
  upstream.connect();

  const shutdown = async () => {
    logger.info('Shutting down');
    await downstream.stop();
    upstream.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
