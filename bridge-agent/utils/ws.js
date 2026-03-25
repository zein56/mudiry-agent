function sendJson(ws, message) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) {
      return reject(new Error('WebSocket not open'));
    }
    const data = JSON.stringify(message);
    ws.send(data, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

module.exports = { sendJson };
