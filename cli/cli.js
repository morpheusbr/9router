#!/usr/bin/env node

const path = require("path");
const fs = require("fs");

const { 
  createSpinner, 
  compareVersions, 
  isRestrictedEnvironment, 
  checkForUpdate, 
  openBrowser 
} = require("./src/cli/utils/sysUtils");

const {
  waitServerReady,
  getLanIp,
} = require("./src/cli/utils/netUtils");

const pkg = require("./package.json");
const { ensureSqliteRuntime } = require("./hooks/sqliteRuntime");
const { ensureTrayRuntime } = require("./hooks/trayRuntime");
const { dispatchSubcommand } = require("./src/cli/commands/registry");
const {
  APP_NAME,
  DEFAULT_PORT,
  DEFAULT_HOST,
  MAX_PORT_ATTEMPTS,
  PROCESS_IDENTIFIERS
} = require("./src/cli/constants");

const args = process.argv.slice(2);

// Handle registered subcommands (e.g. xai video, sync, alias, task)
(async () => {
  const handled = await dispatchSubcommand(args);
  if (handled) return;

  // Self-heal SQLite & Tray runtimes
  try { ensureSqliteRuntime({ silent: true }); } catch {}
  try { ensureTrayRuntime({ silent: true }); } catch {}

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

  // Auto-relaunch after update fallback
  if (skipUpdate && !trayMode && !process.stdin.isTTY) {
    trayMode = true;
    process.env.TRAY_MODE = "1";
  }

  const { 
    killAllAppProcesses, 
    killProcessOnPort, 
    killProxyByPidFile, 
    killTunnelByPidFile 
  } = require("./src/cli/utils/processManager");

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

  const updatePromise = checkForUpdate(skipUpdate);
  await killAllAppProcesses(port);
  await killProcessOnPort(port);

  startServer({ port, host, trayMode, showLog, skipUpdate }, updatePromise);

  function startServer(opts, updatePromise) {
    const { port, host, trayMode, showLog } = opts;
    const latestVersionPromise = Promise.resolve(updatePromise);
    const displayHost = host === DEFAULT_HOST ? "localhost" : host;
    const url = `http://${displayHost}:${port}/dashboard`;

    if (host === DEFAULT_HOST) {
      const lanIp = getLanIp();
      if (lanIp) console.log(`\x1b[33m⚠ Network-exposed: reachable at http://${lanIp}:${port} (bound 0.0.0.0). Use --host 127.0.0.1 for local-only.\x1b[0m`);
    }

    let isCleaningUp = false;
    function cleanup() {
      if (isCleaningUp) return;
      isCleaningUp = true;
      try {
        try {
          const { killTray } = require("./src/cli/tray/tray");
          killTray();
        } catch (e) { }
        killProxyByPidFile();
        killTunnelByPidFile();
      } catch (e) { }
    }

    let isShuttingDown = false;
    process.on("uncaughtException", (err) => {
      if (isShuttingDown) return;
      console.error("Error:", err.message);
    });

    const handleExitSignal = () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log("\nExiting...");
      cleanup();
      setTimeout(() => process.exit(0), 100);
    };

    process.on("SIGINT", handleExitSignal);
    process.on("SIGTERM", handleExitSignal);
    process.on("SIGHUP", handleExitSignal);

    const initTrayIcon = () => {
      try {
        const { initTray } = require("./src/cli/tray/tray");
        initTray({
          port,
          onQuit: handleExitSignal,
          onOpenDashboard: () => openBrowser(url)
        });
      } catch (err) {}
    };

    if (trayMode) {
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

    waitServerReady(port).then(async () => {
      const latestVersion = await latestVersionPromise;
      initTrayIcon();

      try {
        if (latestVersion) {
          console.log(`\n⬆ Update v${pkg.version} → v${latestVersion} available! Run: npm i -g ${pkg.name}@latest\n`);
        }

        const { startChatUI } = require("./src/cli/chatUI");
        await startChatUI(port);

        handleExitSignal();
      } catch (err) {
        console.error("Error:", err.message);
        cleanup();
        process.exit(1);
      }
    });
  }
})();
