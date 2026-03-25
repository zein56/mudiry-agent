"use strict";

async function routeMessage(message, deviceManager, logger) {
  if (!message || typeof message !== "object") {
    logger.warn("Invalid message payload", { message });
    return { ok: false, error: "invalid_message" };
  }

  if (message.type === "device_command") {
    return deviceManager.executeCommand({
      deviceId: message.deviceId,
      action: message.action,
      payload: message.payload,
      requestId: message.requestId
    });
  }

  logger.debug("Unhandled message type", { type: message.type });
  return { ok: false, error: "unsupported_message" };
}

module.exports = {
  routeMessage
};
