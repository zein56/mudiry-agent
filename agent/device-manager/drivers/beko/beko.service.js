"use strict";

const BEKO_DEVICE = "beko-x30tr";
const ALLOWED_ACTIONS = new Set(["payment", "cancel", "refund", "fiscal_print"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeAmount(value, fieldName) {
  const num = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isFinite(num)) throw new Error(`${fieldName} must be a number`);
  if (num < 0) throw new Error(`${fieldName} must be greater than or equal to 0`);
  return num;
}

function normalizeItems(items) {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw new Error("items must be an array");
  return items;
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return undefined;
}

class BekoService {
  constructor({ device, logger }) {
    this.device = device;
    this.logger = logger;
  }

  buildRequest(action, payload) {
    const normalizedAction = this.normalizeAction(action);
    const data = this.normalizePayload(normalizedAction, payload);
    return { device: BEKO_DEVICE, action: normalizedAction, data };
  }

  normalizeAction(action) {
    if (typeof action !== "string" || action.trim() === "") {
      throw new Error("action is required");
    }
    const normalized = action.trim().toLowerCase();
    if (!ALLOWED_ACTIONS.has(normalized)) {
      throw new Error(`Unsupported Beko action: ${action}`);
    }
    return normalized;
  }

  normalizePayload(action, payload) {
    let data;
    if (payload === undefined || payload === null) {
      data = {};
    } else if (!isPlainObject(payload)) {
      throw new Error("payload must be an object");
    } else {
      data = { ...payload };
    }

    if (action === "payment" || action === "refund") {
      if (data.amount === undefined) throw new Error("amount is required");
    }

    if (data.amount !== undefined) {
      data.amount = normalizeAmount(data.amount, "amount");
    }

    if (data.items !== undefined) {
      data.items = normalizeItems(data.items);
    } else if (action === "payment" || action === "fiscal_print") {
      data.items = [];
    }

    const orderId = pickFirst(data, ["orderId", "orderID", "order_id", "orderNo", "order_no", "reference"]);
    if (orderId !== undefined && data.orderId === undefined) data.orderId = orderId;

    const receiptNo = pickFirst(data, ["receiptNo", "receipt_no", "receiptNumber", "receipt_number"]);
    if (receiptNo !== undefined && data.receiptNo === undefined) data.receiptNo = receiptNo;

    const fiscalId = pickFirst(data, ["fiscalId", "fiscal_id"]);
    if (fiscalId !== undefined && data.fiscalId === undefined) data.fiscalId = fiscalId;

    return data;
  }

  normalizeResponse(action, response) {
    if (!isPlainObject(response)) throw new Error("Invalid response from bridge");

    if ("status" in response && response.status !== "success") {
      const message = response.message || response.error || "Bridge error";
      throw new Error(message);
    }

    if ("ok" in response && response.ok === false) {
      const message = response.message || response.error || "Bridge error";
      throw new Error(message);
    }

    return response;
  }
}

module.exports = {
  BekoService,
  BEKO_DEVICE
};
