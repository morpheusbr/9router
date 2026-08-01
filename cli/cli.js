#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const { 
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
const { dispatchSubcommand, COMMANDS } = require("./src/cli/commands/registry");
const {
  APP_NAME,
  DEFAULT_PORT,
  DEFAULT_HOST,
  PORT_MIN,
  PORT_MAX,
} = require("./src/cli/constants");
const {
  getLockFilePath,
  acquireLock,
  releaseLock,
} = require("./src/cli/utils/lifecycle");

const args = process.argv.slice(2);

// Handle registered subcommands (e.g. xai video, sync, alias, task)
(async () => {
  const handled = await dispatchSubcommand(args);
  if (handled) return;

  // Self-heal SQLite & Tray runtimes
  try { ensureSqliteRuntime({ silent: true }); } catch (e) { if (process.env.DEBUG) console.warn("[self-heal] SQLite:", e.message); }
  try { ensureTrayRuntime({ silent: true }); } catch (e) { if (process.env.DEBUG) console.warn("[self-heal] Tray:", e.message); }

  process.on("SIGINT", () => {
    releaseLock();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    releaseLock();
    process.exit(0);
  });
  process.on("exit", () => {
    releaseLock();
  });

  const lockHolder = acquireLock();
  if (lockHolder) {
    console.error(`❌ HiperRouter já está em execução (PID ${lockHolder}).`);
    console.error(`   Pare com: hiperrouter stop`);
    console.error(`   Ou remova o lock: ${getLockFilePath()}`);
    process.exit(1);
  }

  // Parse arguments
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;
  let hostFromCli = false;
  let portFromCli = false;
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
      portFromCli = true;
      i++;
    } else if (args[i] === "--host" || args[i] === "-H") {
      const raw = args[i + 1];
      if (!raw || !raw.trim()) {
        console.error(`❌ Invalid host: "${raw}".`);
        process.exit(1);
      }
      host = raw.trim();
      hostFromCli = true;
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
      const { printGlobalHelp } = require("./src/cli/commands/help");
      printGlobalHelp(COMMANDS);
      process.exit(0);
    } else if (args[i] === "--version" || args[i] === "-v") {
      console.log(pkg.version);
      process.exit(0);
    } else if (args[i].startsWith("-")) {
      console.error(`❌ Opção desconhecida: ${args[i]}`);
      console.error(`   Use: hiperrouter --help`);
      process.exit(1);
    }
  }

  // Auto-relaunch after update fallback
  if (skipUpdate && !trayMode && !process.stdin.isTTY) {
    trayMode = true;
    process.env.TRAY_MODE = "1";
  }

  const {
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
  if (savedPort && !portFromCli) {
    port = savedPort;
  }
  const savedHost = configStore.get("defaultHost");
  if (savedHost && !hostFromCli) {
    host = savedHost;
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
    const displayHost = (host === "0.0.0.0" || host === "127.0.0.1") ? "localhost" : host;
    const url = `http://${displayHost}:${port}/dashboard`;

    if (host === "0.0.0.0") {
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
        HOSTNAME: host,
        NODE_ENV: "production",
      };

      serverProcess = spawn(process.execPath, [serverPath], {
        env: buildEnvWithRuntime(env),
        cwd: standaloneDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      serverProcess.on("error", (err) => {
        console.error(`\x1b[31m❌ Failed to start server process. This is a fatal error.\x1b[0m`);
        console.error(`   Error: ${err.message}`);
        cleanup();
        process.exit(1);
      });

      let serverStderrBuffer = [];
      const MAX_BUFFER = 100;

      // Pipe stdout if showLog
      if (serverProcess.stdout) {
        serverProcess.stdout.on("data", (chunk) => {
          if (showLog) process.stdout.write(chunk);
        });
      }

      // Capture stderr from server child
      if (serverProcess.stderr) {
        serverProcess.stderr.on("data", (chunk) => {
          const str = chunk.toString();
          if (showLog) {
            process.stderr.write(chunk);
          } else {
            const msg = str.trim();
            if (msg) {
              // Always log errors, filter for display later if needed
              console.error(`[server] ${msg}`);
            }
          }
          const lines = str.split("\n");
          for (const l of lines) {
            serverStderrBuffer.push(l);
            if (serverStderrBuffer.length > MAX_BUFFER) serverStderrBuffer.shift();
          }
        });
      }

      // Detect unexpected server exits (crash)
      const serverStartTime = Date.now();
      serverProcess.on("exit", async (code, signal) => {
        if (isShuttingDown || isAlreadyRunning) return;
        const uptime = Date.now() - serverStartTime;
        if (code !== 0 && code !== null) {
          console.error(`\x1b[31m❌ Server exited with code ${code}${signal ? ` (signal: ${signal})` : ''}.\x1b[0m`);
          if (uptime < 2000) {
            console.error(`\x1b[31m   Server crashed immediately.\x1b[0m`);
          }

          // Trigger Wolverine mode
          try {
            const { selfHeal } = require("./src/cli/chat/selfHealRuntime");
            const fullLog = serverStderrBuffer.join("\n");
            // Only try to heal if there's an actual stack trace / Error in the log
            if (fullLog.includes("Error:") || fullLog.includes("Exception") || fullLog.match(/at\s+.*?:[0-9]+/)) {
              console.log(`\n\x1b[33m⚡ Disparando Wolverine Mode para o Server (Next.js)...\x1b[0m`);
              const healed = await selfHeal(fullLog, "server");
              if (healed) {
                console.log(`\n\x1b[32m🔄 Reiniciando servidor Web após auto-cura...\x1b[0m\n`);
                startServer(opts, updatePromise);
                return; // Prevent exit
              }
            }
          } catch (e) {
            console.error("Wolverine mode crashed:", e.message);
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

    async function handleGlobalCrash(errStr, context) {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.error("\x1b[31mFatal CLI Error:\x1b[0m", errStr);

      try {
        const { selfHeal } = require("./src/cli/chat/selfHealRuntime");
        console.log(`\n\x1b[33m⚡ Disparando Wolverine Mode para o CLI...\x1b[0m`);
        const healed = await selfHeal(errStr, context);
        if (healed) {
          console.log(`\n\x1b[32m✅ Arquivo do CLI corrigido. Por favor, reinicie o HiperRouter CLI.\x1b[0m\n`);
        }
      } catch (e) {
        console.error("Wolverine mode failed:", e.message);
      }

      cleanup();
      process.exit(1);
    }

    process.on("uncaughtException", (err) => {
      handleGlobalCrash(err.stack || err.message, "cli");
    });

    process.on("unhandledRejection", (reason) => {
      const errStr = reason instanceof Error ? reason.stack : String(reason);
      handleGlobalCrash(errStr, "cli");
    });

    // Detect EADDRINUSE from server child and show clear message
    if (serverProcess && !isAlreadyRunning && !showLog && serverProcess.stderr) {
      serverProcess.stderr.on("data", (chunk) => {
        const msg = chunk.toString();
        if (msg.includes("EADDRINUSE")) {
          console.error(`\x1b[31m\n✖ Port ${port} is already in use by another process.\x1b[0m`);
          console.error(`  Try a different port: ${APP_NAME} --port ${port + 1}`);
          console.error(`  Or kill the occupying process: lsof -i :${port} -t | xargs kill`);
        }
      });
    }

    const handleExitSignal = () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log("\nExiting...");
      cleanup();
      // Give cleanup enough time for SIGTERM→SIGKILL escalation (5s in cleanup)
      setTimeout(() => process.exit(0), 6000);
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
        const chatResult = await startChatUI(port);

        if (chatResult === false && !trayMode) {
          // Keep the server running instead of exiting when there are no providers
          console.log(`\n\x1b[36mℹ Servidor continua rodando na porta ${port}.\x1b[0m`);
          console.log(`\x1b[36m  Pressione Ctrl+C para sair.\x1b[0m\n`);
        } else if (!trayMode) {
          handleExitSignal();
        }
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
