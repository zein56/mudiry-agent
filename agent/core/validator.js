"use strict";

const ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;

function validateDevicePayload(device, config) {
  const errors = [];
  if (!device || typeof device !== "object" || Array.isArray(device)) {
    return { ok: false, errors: ["device must be an object"] };
  }

  const allowedKeys = new Set(["id", "type", "connection", "meta"]);
  for (const key of Object.keys(device)) {
    if (!allowedKeys.has(key)) errors.push(`unexpected field: ${key}`);
  }

  const id = device.id;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    errors.push("device.id must be a string (1-64 chars) with letters, numbers, dot, dash, underscore");
  }

  const allowedDeviceTypes = config?.security?.allowedDeviceTypes || [];
  if (typeof device.type !== "string" || !allowedDeviceTypes.includes(device.type)) {
    errors.push(`device.type must be one of: ${allowedDeviceTypes.join(", ") || "<none>"}`);
  }

  const connection = device.connection;
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
    errors.push("device.connection must be an object");
  } else {
    const connectionType = connection.type;
    const allowedConnectionTypes = config?.security?.allowedConnectionTypes || [];
    if (typeof connectionType !== "string" || !allowedConnectionTypes.includes(connectionType)) {
      errors.push(`connection.type must be one of: ${allowedConnectionTypes.join(", ") || "<none>"}`);
    }

    if (connectionType === "network") {
      const ip = connection.ip;
      const host = connection.host;
      if (typeof ip !== "string" && typeof host !== "string") {
        errors.push("network connection requires ip or host");
      }
      if (typeof ip === "string" && !IPV4_PATTERN.test(ip)) {
        errors.push("connection.ip must be a valid IPv4 address");
      }
      if (typeof host === "string" && host !== "localhost" && !HOSTNAME_PATTERN.test(host)) {
        errors.push("connection.host must be a valid hostname");
      }
      if (connection.port !== undefined) {
        const port = Number(connection.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          errors.push("connection.port must be a valid TCP port (1-65535)");
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function normalizeDevice(device) {
  const normalized = {
    id: device.id,
    type: device.type,
    connection: { ...device.connection }
  };
  if (device.meta !== undefined) normalized.meta = device.meta;
  return normalized;
}

function validateRemovePayload(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, error: "payload must be an object" };
  const id = payload.id || payload.deviceId;
  if (!id || typeof id !== "string") return { ok: false, error: "device id is required" };
  return { ok: true, id };
}

module.exports = {
  validateDevicePayload,
  validateRemovePayload,
  normalizeDevice
};
