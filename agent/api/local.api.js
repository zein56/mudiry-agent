"use strict";

const express = require("express");

function createLocalApi({ config, logger, deviceManager }) {
  const app = express();
  const jsonLimit = config?.http?.jsonLimit || "64kb";

  app.use(express.json({ limit: jsonLimit }));

  app.get("/device/list", (req, res) => {
    const devices = deviceManager.listDevices();
    res.json({ ok: true, devices });
  });

  app.post("/device/add", async (req, res) => {
    const device = req.body?.device ?? req.body;
    const result = await deviceManager.addDevice(device);

    if (!result.ok) {
      const status = result.error === "validation_failed"
        ? 400
        : result.error === "device_exists"
        ? 409
        : result.error === "device_limit_reached"
        ? 429
        : 500;
      return res.status(status).json(result);
    }

    res.status(201).json(result);
  });

  app.post("/device/remove", async (req, res) => {
    const id = req.body?.id ?? req.body?.deviceId;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ ok: false, error: "device_id_required" });
    }

    const result = await deviceManager.removeDevice(id);
    if (!result.ok) {
      const status = result.error === "device_not_found" ? 404 : 500;
      return res.status(status).json(result);
    }

    res.json(result);
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  let server;

  async function start() {
    const port = config?.http?.port ?? 8080;
    const host = config?.http?.host ?? "127.0.0.1";
    return new Promise((resolve) => {
      server = app.listen(port, host, () => {
        logger.info("Local API listening", { host, port });
        resolve();
      });
    });
  }

  async function stop() {
    if (!server) return;
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return {
    app,
    start,
    stop
  };
}

module.exports = {
  createLocalApi
};
