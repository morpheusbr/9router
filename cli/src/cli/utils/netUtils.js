const net = require("net");
const os = require("os");
const http = require("http");

// Poll until the server accepts TCP connections on port, or timeout — avoids blind fixed waits.
function waitServerReady(port, { timeoutMs = 15000, intervalMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryConnect = () => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.destroy();
        // Server accepted TCP. Now ensure HTTP is alive.
        checkHttpReady(port, deadline, intervalMs, resolve);
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(tryConnect, intervalMs);
      });
    };
    tryConnect();
  });
}

function checkHttpReady(port, deadline, intervalMs, resolve) {
  const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
    // If it returns a status, it's alive (even 404 is technically an alive web server).
    // Our health endpoint returns 200.
    resolve(true);
  });

  req.on('error', () => {
    if (Date.now() >= deadline) return resolve(false);
    setTimeout(() => checkHttpReady(port, deadline, intervalMs, resolve), intervalMs);
  });

  req.end();
}

// First non-internal IPv4 — the address remote peers actually reach when bound to 0.0.0.0.
function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

module.exports = {
  waitServerReady,
  getLanIp,
};
