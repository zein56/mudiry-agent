"use strict";

const path = require("path");
const { loadConfig } = require("./core/config");
const { createLogger } = require("./core/logger");
const DeviceManager = require("./device-manager/device.manager");
const { createLocalApi } = require("./api/local.api");
const { routeMessage } = require("./router");
const { WsClient } = require("./services/ws.client");

async function main() {
  const configPath = path.join(__dirname, "config.json");
  const config = loadConfig(configPath);
  const logger = createLogger(config.logging);

  const deviceManager = new DeviceManager({ config, logger });
  await deviceManager.loadFromStorage();

  const localApi = createLocalApi({ config, logger, deviceManager });
  await localApi.start();

  let wsClient;
  if (config.ws?.enabled) {
    wsClient = new WsClient({ config: config.ws, logger });
    wsClient.on("message", async (message) => {
      await routeMessage(message, deviceManager, logger);
    });
    wsClient.connect();
  }

  const shutdown = async () => {
    logger.info("Shutting down device agent");
    if (wsClient) await wsClient.disconnect();
    await localApi.stop();
    await deviceManager.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error", err);
  process.exit(1);
});
