/**
 * Shared gateway lifecycle helpers (lock, status, stop).
 * Used by cli.js and start/stop/status/restart subcommands.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getCliDataDir, DEFAULT_PORT, DEFAULT_HOST } = require("../constants");
const { waitServerReady } = require("./netUtils");
const configStore = require("./configStore");

function getLockFilePath() {
  return path.join(getCliDataDir(), ".cli.pid");
}

function readLockPid() {
  try {
    const lockFile = getLockFilePath();
    if (!fs.existsSync(lockFile)) return null;
    const pid = parseInt(fs.readFileSync(lockFile, "utf8").trim(), 10);
    return pid && !isNaN(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  try {
    const lockFile = getLockFilePath();
    const dir = path.dirname(lockFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const existingPid = readLockPid();
    if (existingPid && existingPid !== process.pid) {
      if (isPidAlive(existingPid)) return existingPid;
    }
    fs.writeFileSync(lockFile, String(process.pid), "utf8");
    return 0;
  } catch {
    return 0;
  }
}

function releaseLock() {
  try {
    const lockFile = getLockFilePath();
    if (!fs.existsSync(lockFile)) return;
    const content = fs.readFileSync(lockFile, "utf8").trim();
    if (parseInt(content, 10) === process.pid) {
      fs.unlinkSync(lockFile);
    }
  } catch {}
}

function clearStaleLock() {
  const pid = readLockPid();
  if (pid && !isPidAlive(pid)) {
    try { fs.unlinkSync(getLockFilePath()); } catch {}
    return true;
  }
  return false;
}

function resolvePort(cliPort) {
  if (cliPort) return cliPort;
  return configStore.get("defaultPort", DEFAULT_PORT);
}

function resolveHost(cliHost) {
  if (cliHost) return cliHost;
  return configStore.get("defaultHost", DEFAULT_HOST);
}

/**
 * @returns {Promise<{running: boolean, pid: number|null, port: number, host: string, ready: boolean, lockFile: string, staleLock: boolean}>}
 */
async function getStatus(opts = {}) {
  const port = resolvePort(opts.port);
  const host = resolveHost(opts.host);
  const pid = readLockPid();
  const alive = isPidAlive(pid);
  const staleLock = Boolean(pid && !alive);
  let ready = false;
  try {
    ready = await waitServerReady(port, { timeoutMs: opts.timeoutMs || 1500, intervalMs: 100 });
  } catch {
    ready = false;
  }
  return {
    running: alive || ready,
    pid: alive ? pid : null,
    port,
    host,
    ready,
    lockFile: getLockFilePath(),
    staleLock,
  };
}

/**
 * Stop gateway: prefer the CLI lock holder; only kill-by-port with --force.
 * Avoids taking down unmanaged processes (e.g. PM2) by accident.
 * @returns {Promise<{stopped: boolean, message: string}>}
 */
async function stopGateway(opts = {}) {
  const port = resolvePort(opts.port);
  clearStaleLock();

  const {
    killAllAppProcesses,
    killProcessOnPort,
    killProxyByPidFile,
    killTunnelByPidFile,
  } = require("./processManager");

  const pid = readLockPid();
  let signaled = false;
  const hadCliLock = Boolean(pid && isPidAlive(pid) && pid !== process.pid);

  if (hadCliLock) {
    try {
      process.kill(pid, "SIGTERM");
      signaled = true;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && isPidAlive(pid)) {
        try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); } catch {}
      }
      if (isPidAlive(pid)) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
    } catch {}
  }

  try { killProxyByPidFile(); } catch {}
  try { killTunnelByPidFile(); } catch {}

  if (opts.force || hadCliLock) {
    if (opts.force) await killAllAppProcesses(port);
    await killProcessOnPort(port);
  }

  try {
    if (fs.existsSync(getLockFilePath())) fs.unlinkSync(getLockFilePath());
  } catch {}

  const after = await getStatus({ port, timeoutMs: 800 });
  if (!after.running && !after.ready) {
    return {
      stopped: true,
      message: signaled
        ? `HiperRouter parado (PID ${pid}).`
        : `Nenhum processo CLI ativo; porta ${port} livre.`,
    };
  }

  if (!hadCliLock && !opts.force) {
    return {
      stopped: false,
      message: `Porta ${port} em uso, mas sem lock do CLI (ex.: PM2/serviço). Use: hiperrouter stop --force`,
    };
  }

  return {
    stopped: false,
    message: `Ainda há algo na porta ${port}. Tente: hiperrouter stop --force  ou  lsof -i :${port} -t | xargs kill`,
  };
}

/**
 * Spawn a detached background instance (tray mode).
 * @returns {{pid: number}}
 */
function startDetached(opts = {}) {
  const port = resolvePort(opts.port);
  const host = resolveHost(opts.host);
  const cliEntry = opts.cliEntry || require.main?.filename || path.join(__dirname, "../../../cli.js");

  const args = [
    cliEntry,
    "--tray",
    "--no-browser",
    "--skip-update",
    "--port", String(port),
    "--host", host,
  ];
  if (opts.quiet) args.push("--quiet");

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
    cwd: path.dirname(cliEntry),
  });
  child.unref();
  return { pid: child.pid, port, host };
}

module.exports = {
  getLockFilePath,
  readLockPid,
  isPidAlive,
  acquireLock,
  releaseLock,
  clearStaleLock,
  resolvePort,
  resolveHost,
  getStatus,
  stopGateway,
  startDetached,
};
