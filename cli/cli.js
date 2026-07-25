#!/usr/bin/env node

const { spawn, exec, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const https = require("https");
const net = require("net");
const os = require("os");

// Poll until the server accepts TCP connections on port, or timeout — avoids blind fixed waits.
function waitServerReady(port, { timeoutMs = 15000, intervalMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryConnect = () => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.destroy();
        resolve(true);
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

const { 
  createSpinner, 
  compareVersions, 
  isRestrictedEnvironment, 
  checkForUpdate, 
  openBrowser 
} = require("./src/cli/utils/sysUtils");

const pkg = require("./package.json");
const { ensureSqliteRuntime, buildEnvWithRuntime } = require("./hooks/sqliteRuntime");
const { ensureTrayRuntime } = require("./hooks/trayRuntime");
const args = process.argv.slice(2);

// Subcommands (`9router xai video …`) run against an already-running gateway
// and bypass the launcher flow (no runtime self-heal, no server spawn).
if (args[0] === "xai" && args[1] === "video") {
  const { run } = require("./src/cli/commands/xaiVideo");
  run(args.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`❌ ${err?.message || err}`);
      process.exit(1);
    });
  return;
}

if (args[0] === "sync") {
  const { run } = require("./src/cli/commands/sync");
  run(args.slice(1))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`❌ ${err?.message || err}`);
      process.exit(1);
    });
  return;
}

if (args[0] === "alias") {
  const { run } = require("./src/cli/commands/alias");
  run(args.slice(1))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`❌ ${err?.message || err}`);
      process.exit(1);
    });
  return;
}

if (args[0] === "task") {
  const { run } = require("./src/cli/commands/task");
  run(args.slice(1))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`❌ ${err?.message || err}`);
      process.exit(1);
    });
  return;
}

// Self-heal SQLite runtime deps (sql.js + better-sqlite3) into ~/.HiperRouter/runtime
// so the server can resolve them via NODE_PATH. Best-effort — sql.js is required,
// better-sqlite3 is optional. Logs to stderr only on failure.
try { ensureSqliteRuntime({ silent: true }); } catch {}

// Self-heal tray runtime (systray for macOS/Linux only). Windows skipped.
try { ensureTrayRuntime({ silent: true }); } catch {}

// Configuration constants
const APP_NAME = "HiperRouter"; // Use custom display name
const INSTALL_CMD_LATEST = `npm i -g ${pkg.name}@latest --prefer-online`;

const DEFAULT_PORT = 20128;
const DEFAULT_HOST = "0.0.0.0";

// First non-internal IPv4 — the address remote peers actually reach when bound to 0.0.0.0.
function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

// Local URL stays "localhost"; warn separately when bound to all interfaces (network-exposed).
function getDisplayHost() {
  return host === DEFAULT_HOST ? "localhost" : host;
}
const MAX_PORT_ATTEMPTS = 10;
// Identifiers for killAllAppProcesses - only kill 9router specifically
const PROCESS_IDENTIFIERS = [
  '9router'  // Only package name - avoid killing other apps
];

// Parse arguments
let port = DEFAULT_PORT;
let host = DEFAULT_HOST;
let noBrowser = false;
let skipUpdate = false;
let showLog = false;
let trayMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" || args[i] === "-p") {
    port = parseInt(args[i + 1], 10) || DEFAULT_PORT;
    i++;
  } else if (args[i] === "--host" || args[i] === "-H") {
    host = args[i + 1] || DEFAULT_HOST;
    i++;
  } else if (args[i] === "--no-browser" || args[i] === "-n") {
    noBrowser = true;
  } else if (args[i] === "--log" || args[i] === "-l") {
    showLog = true;
  } else if (args[i] === "--skip-update") {
    skipUpdate = true;
  } else if (args[i] === "--tray" || args[i] === "-t") {
    trayMode = true;
    process.env.TRAY_MODE = "1";
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
Usage: ${APP_NAME} [options]

Options:
  -p, --port <port>   Port to run the server (default: ${DEFAULT_PORT})
  -H, --host <host>   Host to bind (default: ${DEFAULT_HOST})
  -n, --no-browser    Don't open browser automatically
  -l, --log           Show server logs (default: hidden)
  -t, --tray          Run in system tray mode (background)
  --skip-update       Skip auto-update check
  -h, --help          Show this help message
  -v, --version       Show version

Commands:
  xai video --prompt "..." --output video.mp4
                      Generate a Grok Imagine video via the running gateway
                      (see: ${APP_NAME} xai video --help)
`);
    process.exit(0);
  } else if (args[i] === "--version" || args[i] === "-v") {
    console.log(pkg.version);
    process.exit(0);
  }
}

// Auto-relaunch after update: detached process has no TTY → fallback to tray
if (skipUpdate && !trayMode && !process.stdin.isTTY) {
  trayMode = true;
  process.env.TRAY_MODE = "1";
}

// Always use Node.js runtime with absolute path
const RUNTIME = process.execPath;



// Get app data dir (matches app/src/lib/dataDir.js convention)
function getAppDataDir() {
  return path.resolve(__dirname, "..", ".HiperRouter");
}

const { 
  killAllAppProcesses, 
  killProcessOnPort, 
  killProxyByPidFile, 
  killTunnelByPidFile 
} = require("./src/cli/utils/processManager");




// Find standalone server (bundled in bin/app for published package).
// Prefer custom-server.js (injects real socket IP) when present.
const standaloneDir = path.join(__dirname, "app");
const customServerPath = path.join(standaloneDir, "custom-server.js");
const serverPath = fs.existsSync(customServerPath)
  ? customServerPath
  : path.join(standaloneDir, "server.js");

if (!fs.existsSync(serverPath)) {
  console.error("Error: Standalone build not found.");
  console.error("Please run 'npm run build:cli' first.");
  process.exit(1);
}

// Start server immediately; run update check in parallel (not on the critical path).
const updatePromise = checkForUpdate(skipUpdate);
killAllAppProcesses(port)
  .then(() => killProcessOnPort(port))
  .then(() => startServer(updatePromise));

// Show interface selection menu
async function showInterfaceMenu(latestVersion) {
  const { selectMenu } = require("./src/cli/utils/input");
  const { clearScreen } = require("./src/cli/utils/display");
  const { getEndpoint } = require("./src/cli/utils/endpoint");

  clearScreen();

  const displayHost = getDisplayHost();

  // Detect tunnel/local mode for server URL display
  let serverUrl;
  try {
    const { endpoint, tunnelEnabled } = await getEndpoint(port);
    serverUrl = tunnelEnabled ? endpoint.replace(/\/v1$/, "") : `http://${displayHost}:${port}`;
  } catch (e) {
    serverUrl = `http://${displayHost}:${port}`;
  }

  const subtitle = `🚀 Server: \x1b[32m${serverUrl}\x1b[0m`;

  const menuItems = [];

  if (latestVersion) {
    menuItems.push({ label: `Update to v${latestVersion} (current: v${pkg.version})`, icon: "⬆" });
  }

  menuItems.push(
    { label: "Web UI (Open in Browser)", icon: "🌐" },
    { label: "Terminal UI (Interactive CLI)", icon: "💻" },
    { label: "Hide to Tray (Background)", icon: "🔔" },
    { label: "Exit", icon: "🚪" }
  );

  const selected = await selectMenu(`Choose Interface (v${pkg.version})`, menuItems, 0, subtitle);

  const offset = latestVersion ? 1 : 0;

  if (latestVersion && selected === 0) return "update";
  if (selected === offset) return "web";
  if (selected === offset + 1) return "terminal";
  if (selected === offset + 2) return "hide";
  return "exit";
}

const MAX_RESTARTS = 2;
const RESTART_RESET_MS = 30000; // Reset counter if alive > 30s

function startServer(updatePromise) {
  // Accept either a Promise (parallel update check) or a resolved value.
  const latestVersionPromise = Promise.resolve(updatePromise);
  const displayHost = getDisplayHost();
  const url = `http://${displayHost}:${port}/dashboard`;
  // Surface real network exposure when bound to all interfaces (default 0.0.0.0).
  if (host === DEFAULT_HOST) {
    const lanIp = getLanIp();
    if (lanIp) console.log(`\x1b[33m⚠ Network-exposed: reachable at http://${lanIp}:${port} (bound 0.0.0.0). Use --host 127.0.0.1 for local-only.\x1b[0m`);
  }

  let restartCount = 0;
  let serverStartTime = Date.now();

  const CRASH_LOG_LINES = 50;
  let crashLog = [];

  function spawnServer() {
    serverStartTime = Date.now();
    crashLog = [];
    
    // Log informativo de que o PM2 gerencia o servidor
    console.log("\n\x1b[36mℹ Modo Gerenciado: O servidor web já roda permanentemente (PM2). O CLI servirá apenas como controle.\x1b[0m\n");
    
    const EventEmitter = require('events');
    const child = new EventEmitter();
    child.pid = null;
    if (!showLog) {
      child.stderr = new EventEmitter();
    }
    
    return child;
  }

  let server = spawnServer();

  // Cleanup function - force kill server process
  let isCleaningUp = false;
  function cleanup() {
    if (isCleaningUp) return;
    isCleaningUp = true;
    try {
      // Kill tray if running
      try {
        const { killTray } = require("./src/cli/tray/tray");
        killTray();
      } catch (e) { }
      // Kill MIT server (privileged process) via PID file
      killProxyByPidFile();
      // Kill cloudflared/tailscale via PID file (only this app's tunnel)
      killTunnelByPidFile();
      // Kill server process directly
      if (server.pid) {
        process.kill(server.pid, "SIGKILL");
      }
      // Also try to kill process group
      process.kill(-server.pid, "SIGKILL");
    } catch (e) { }
  }

  // Suppress all errors during shutdown (systray lib throws JSON parse errors)
  let isShuttingDown = false;
  process.on("uncaughtException", (err) => {
    if (isShuttingDown) return;
    console.error("Error:", err.message);
  });

  // Handle all exit scenarios
  process.on("SIGINT", () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("\nExiting...");
    cleanup();
    setTimeout(() => process.exit(0), 100);
  });
  process.on("SIGTERM", () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    cleanup();
    setTimeout(() => process.exit(0), 100);
  });
  process.on("SIGHUP", () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    cleanup();
    setTimeout(() => process.exit(0), 100);
  });

  // Initialize tray icon (runs alongside TUI)
  const initTrayIcon = () => {
    try {
      const { initTray } = require("./src/cli/tray/tray");
      initTray({
        port,
        onQuit: () => {
          isShuttingDown = true;
          console.log("\n👋 Shutting down from tray...");
          cleanup();
          setTimeout(() => process.exit(0), 100);
        },
        onOpenDashboard: () => openBrowser(url)
      });
    } catch (err) {
      // Tray not available - continue without it
    }
  };

  // Tray-only mode: no TUI, just tray icon
  if (trayMode) {
    // Ignore SIGHUP so macOS terminal close doesn't kill the background tray process
    process.removeAllListeners("SIGHUP");
    process.on("SIGHUP", () => {});

    console.log(`\n🚀 ${pkg.name} v${pkg.version}`);
    console.log(`Server: http://${displayHost}:${port}`);

    waitServerReady(port).then(() => {
      initTrayIcon();
      console.log("\n💡 Router is now running in system tray. Close this terminal if you want.");
      console.log("   Right-click tray icon to open dashboard or quit.\n");
    });

    return;
  }

  // Wait for server to be ready, then show interface menu loop + tray
  waitServerReady(port).then(async () => {
    // Resolve parallel update check (already running); don't block server start on it.
    const latestVersion = await latestVersionPromise;
    // Start tray icon alongside TUI
    initTrayIcon();

    try {
      if (latestVersion) {
        console.log(`\n⬆ Update v${pkg.version} → v${latestVersion} available! Run: ${INSTALL_CMD_LATEST}\n`);
      }

      const { startChatUI } = require("./src/cli/chatUI");
      await startChatUI(port);

      isShuttingDown = true;
      console.log("\nExiting...");
      cleanup();
      setTimeout(() => process.exit(0), 100);
    } catch (err) {
      console.error("Error:", err.message);
      cleanup();
      process.exit(1);
    }
  });

  function attachServerEvents() {
    server.on("error", (err) => {
      console.error("Failed to start server:", err.message);
      if (!isShuttingDown) tryRestart();
      else { cleanup(); process.exit(1); }
    });

    server.on("close", (code) => {
      if (isShuttingDown || code === 0) {
        process.exit(code || 0);
        return;
      }
      tryRestart(code);
    });
  }

  function tryRestart(code) {
    const aliveMs = Date.now() - serverStartTime;
    // Reset counter if last run was stable
    if (aliveMs >= RESTART_RESET_MS) restartCount = 0;

    if (restartCount >= MAX_RESTARTS) {
      console.error(`\n⚠️  Server crashed ${MAX_RESTARTS} times. Disabling MIT and restarting...`);
      try {
        const dbPath = path.join(getAppDataDir(), "db.json");
        if (fs.existsSync(dbPath)) {
          const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
          if (db.settings) db.settings.mitmEnabled = false;
          fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        }
      } catch { /* best effort */ }
      restartCount = 0;
      server = spawnServer();
      attachServerEvents();
      return;
    }

    restartCount++;
    const delay = Math.min(1000 * restartCount, 10000);
    console.error(`\n⚠️  Server exited (code=${code ?? "unknown"}). Restarting in ${delay / 1000}s... (${restartCount}/${MAX_RESTARTS})`);
    if (crashLog.length) {
      console.error("\n--- Server crash log ---");
      crashLog.forEach(l => console.error(l));
      console.error("--- End crash log ---\n");
    }

    setTimeout(() => {
      server = spawnServer();
      attachServerEvents();
    }, delay);
  }

  attachServerEvents();
}
