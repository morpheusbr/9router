#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

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
const { ensureSqliteRuntime, buildEnvWithRuntime } = require("./hooks/sqliteRuntime");
const { ensureTrayRuntime } = require("./hooks/trayRuntime");
const { dispatchSubcommand } = require("./src/cli/commands/registry");
const {
  APP_NAME,
  DEFAULT_PORT,
  DEFAULT_HOST,
  MAX_PORT_ATTEMPTS,
  PORT_MIN,
  PORT_MAX,
  PROCESS_IDENTIFIERS
} = require("./src/cli/constants");

const args = process.argv.slice(2);

// Handle registered subcommands (e.g. xai video, sync, alias, task)
(async () => {
  const handled = await dispatchSubcommand(args);
  if (handled) return;

  // Self-heal SQLite & Tray runtimes
  try { ensureSqliteRuntime({ silent: true }); } catch (e) { if (process.env.DEBUG) console.warn("[self-heal] SQLite:", e.message); }
  try { ensureTrayRuntime({ silent: true }); } catch (e) { if (process.env.DEBUG) console.warn("[self-heal] Tray:", e.message); }

  // Global error handlers — prevent silent crashes
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason instanceof Error ? reason.message : reason);
    if (process.env.DEBUG) console.error(reason);
  });

  // Lockfile — prevent duplicate instances
  const lockFile = path.join(
    process.env.DATA_DIR || path.resolve(__dirname, ".HiperRouter"),
    ".cli.pid"
  );

  function acquireLock() {
    try {
      const dir = path.dirname(lockFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(lockFile)) {
        const existingPid = parseInt(fs.readFileSync(lockFile, "utf8").trim(), 10);
        if (existingPid && existingPid !== process.pid) {
          try {
            process.kill(existingPid, 0); // check if alive
            return existingPid; // still running — lock held
          } catch {
            // stale lock, will overwrite
          }
        }
      }
      fs.writeFileSync(lockFile, String(process.pid), "utf8");
      return 0;
    } catch {
      return 0; // lock check failed, proceed anyway
    }
  }

  function releaseLock() {
    try {
      if (fs.existsSync(lockFile)) {
        const content = fs.readFileSync(lockFile, "utf8").trim();
        if (parseInt(content, 10) === process.pid) {
          fs.unlinkSync(lockFile);
        }
      }
    } catch {}
  }

  const lockHolder = acquireLock();
  if (lockHolder) {
    console.error(`❌ HiperRouter is already running (PID ${lockHolder}).`);
    console.error(`   Stop it first, or delete: ${lockFile}`);
    process.exit(1);
  }

  // Parse arguments
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;
  let noBrowser = false;
  let skipUpdate = false;
  let showLog = false;
  let trayMode = false;
  let quietMode = false;
  let verboseMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" || args[i] === "-p") {
      const raw = args[i + 1];
      const parsed = parseInt(raw, 10);
      if (!raw || isNaN(parsed) || String(parsed) !== raw.trim()) {
        console.error(`❌ Invalid port: "${raw}". Must be a number.`);
        process.exit(1);
      }
      if (parsed < PORT_MIN || parsed > PORT_MAX) {
        console.error(`❌ Port ${parsed} out of range. Must be ${PORT_MIN}-${PORT_MAX}.`);
        process.exit(1);
      }
      port = parsed;
      i++;
    } else if (args[i] === "--host" || args[i] === "-H") {
      const raw = args[i + 1];
      if (!raw || !raw.trim()) {
        console.error(`❌ Invalid host: "${raw}".`);
        process.exit(1);
      }
      host = raw.trim();
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
    } else if (args[i] === "--quiet" || args[i] === "-q") {
      quietMode = true;
      process.env.QUIET = "1";
    } else if (args[i] === "--verbose") {
      verboseMode = true;
      process.env.DEBUG = "1";
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Usage: ${APP_NAME} [options]

Options:
  -p, --port <port>   Port to run the server (default: ${DEFAULT_PORT})
  -H, --host <host>   Host to bind (default: ${DEFAULT_HOST})
  -n, --no-browser    Don't open browser automatically
  -l, --log           Show server logs (default: hidden)
  -t, --tray          Run in system tray mode (background)
  -q, --quiet         Suppress spinners and non-essential output
  --verbose           Show debug information
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

  // --- Early detection: server already running (e.g. PM2 or another CLI instance) ---
  {
    const displayHostEarly = host === DEFAULT_HOST ? "localhost" : host;
    const earlyUrl = `http://${displayHostEarly}:${port}/dashboard`;
    const earlyReady = await waitServerReady(port, { timeoutMs: 1500, intervalMs: 100 });
    if (earlyReady) {
      if (!noBrowser) {
        console.log(`\x1b[36mℹ Servidor já ativo na porta ${port}. Abrindo dashboard...\x1b[0m`);
        openBrowser(earlyUrl);
      } else {
        console.log(`\x1b[36mℹ Servidor já ativo na porta ${port}. Acesse: ${earlyUrl}\x1b[0m`);
      }
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

  // Onboarding wizard for first run
  const { isFirstRun, runOnboarding } = require("./src/cli/utils/onboarding");
  if (isFirstRun() && process.stdin.isTTY && !trayMode) {
    await runOnboarding(APP_NAME, DEFAULT_PORT);
  }

  // Load saved preferences
  const configStore = require("./src/cli/utils/configStore");
  const savedPort = configStore.get("defaultPort");
  if (savedPort && !args.includes("--port") && !args.includes("-p")) {
    port = savedPort;
  }
  const savedBrowser = configStore.get("autoBrowser");
  if (savedBrowser === false && !args.includes("--no-browser") && !args.includes("-n")) {
    noBrowser = true;
  }

  // Startup banner (unless quiet or tray mode)
  if (!quietMode && !trayMode) {
    const { showBanner, showQuickHelp } = require("./src/cli/utils/banner");
    showBanner(pkg.version, port);
  }

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

  startServer({ port, host, trayMode, showLog, skipUpdate, quietMode }, updatePromise);

  async function startServer(opts, updatePromise) {
    const { port, host, trayMode, showLog, quietMode: quiet } = opts;
    const latestVersionPromise = Promise.resolve(updatePromise);
    const displayHost = host === DEFAULT_HOST ? "localhost" : host;
    const url = `http://${displayHost}:${port}/dashboard`;

    if (host === DEFAULT_HOST) {
      const lanIp = getLanIp();
      if (lanIp) console.log(`\x1b[33m⚠ Network-exposed: reachable at http://${lanIp}:${port} (bound 0.0.0.0). Use --host 127.0.0.1 for local-only.\x1b[0m`);
    }

    // Check if server is already running on this port (e.g., PM2 or background service)
    const isAlreadyRunning = await waitServerReady(port, { timeoutMs: 2500, intervalMs: 100 });
    let serverProcess = null;

    if (isAlreadyRunning) {
      console.log(`\x1b[36mℹ Modo Gerenciado: Servidor web já ativo na porta ${port}.\x1b[0m\n`);
    } else {
      console.log(`\x1b[36m🚀 Iniciando servidor Web HiperRouter (porta ${port})...\x1b[0m\n`);
      const env = {
        ...process.env,
        PORT: String(port),
        HOST: host,
        NODE_ENV: "production",
      };

      serverProcess = spawn(process.execPath, [serverPath], {
        env: buildEnvWithRuntime(env),
        cwd: standaloneDir,
        stdio: showLog ? "inherit" : ["ignore", "pipe", "pipe"],
      });

      // Capture stderr from server child — log errors even when showLog=false
      if (!showLog && serverProcess.stderr) {
        serverProcess.stderr.on("data", (chunk) => {
          const msg = chunk.toString().trim();
          if (msg) console.error(`[server] ${msg}`);
        });
      }

      // Detect unexpected server exits (crash)
      const serverStartTime = Date.now();
      serverProcess.on("exit", (code, signal) => {
        if (isShuttingDown || isAlreadyRunning) return;
        const uptime = Date.now() - serverStartTime;
        if (code !== 0 && code !== null) {
          console.error(`\x1b[31m❌ Server exited with code ${code}${signal ? ` (signal: ${signal})` : ''}.\x1b[0m`);
          if (uptime < 2000) {
            console.error(`\x1b[31m   Server crashed immediately — check logs above or run with --log.\x1b[0m`);
          }
          if (!isShuttingDown) {
            cleanup();
            process.exit(1);
          }
        }
      });
    }

    let isCleaningUp = false;
    function cleanup() {
      if (isCleaningUp) return;
      isCleaningUp = true;
      releaseLock();
      try {
        try {
          const { killTray } = require("./src/cli/tray/tray");
          killTray();
        } catch (e) { }
        killProxyByPidFile();
        killTunnelByPidFile();
        if (serverProcess && serverProcess.pid) {
          try {
            process.kill(serverProcess.pid, "SIGTERM");
            const TERM_TIMEOUT = 5000;
            const deadline = Date.now() + TERM_TIMEOUT;
            while (Date.now() < deadline) {
              try { process.kill(serverProcess.pid, 0); } catch { break; }
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
            }
            try { process.kill(serverProcess.pid, "SIGKILL"); } catch {}
          } catch (e) {}
        }
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

    // Safety net — release lock on any exit path
    process.on("exit", () => { releaseLock(); });

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
      }).catch((err) => {
        console.error("❌ Server readiness check failed:", err.message);
        cleanup();
        process.exit(1);
      });
      return;
    }

    waitServerReady(port).then(async (ready) => {
      const active = ready || (await waitServerReady(port, { timeoutMs: 2000 }));
      if (!active) {
        console.error(`\x1b[31m❌ Falha ao iniciar o servidor na porta ${port}.\x1b[0m`);
        cleanup();
        process.exit(1);
      }

      const latestVersion = await latestVersionPromise;
      initTrayIcon();

      // Show quick help for first-time users
      if (!quiet && configStore.get("onboardingDate") && !configStore.get("quickHelpShown")) {
        const { showQuickHelp } = require("./src/cli/utils/banner");
        showQuickHelp();
        configStore.set("quickHelpShown", true);
      }

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
    }).catch((err) => {
      console.error("❌ Unexpected error:", err.message);
      cleanup();
      process.exit(1);
    });
  }
})();
