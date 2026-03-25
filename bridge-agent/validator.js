function parseJson(input, logger) {
  try {
    return JSON.parse(input.toString());
  } catch (err) {
    if (logger) logger.warn({ err }, 'Invalid JSON');
    return null;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateClientMessage(msg) {
  if (!isObject(msg)) return false;
  if (typeof msg.type !== 'string' || msg.type.length === 0) return false;
  if ('targetClientId' in msg && typeof msg.targetClientId !== 'string') return false;
  return true;
}

function validateUpstreamMessage(msg) {
  if (!isObject(msg)) return false;
  if (typeof msg.type !== 'string' || msg.type.length === 0) return false;
  if ('targetClientId' in msg && typeof msg.targetClientId !== 'string') return false;
  return true;
}

module.exports = {
  parseJson,
  validateClientMessage,
  validateUpstreamMessage
};
