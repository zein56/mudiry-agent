function validateClientId(clientId, config) {
  if (!clientId || typeof clientId !== 'string') return false;
  const pattern = config?.security?.clientIdPattern || '^[a-zA-Z0-9_-]{3,64}$';
  const regex = new RegExp(pattern);
  return regex.test(clientId);
}

function validateUpstreamMessageToken(message, config) {
  if (!config?.security?.requireUpstreamToken) return true;
  const token = config?.upstream?.token;
  if (!token) return false;
  return typeof message?.bridgeToken === 'string' && message.bridgeToken === token;
}

module.exports = {
  validateClientId,
  validateUpstreamMessageToken
};
