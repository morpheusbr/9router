/**
 * HiperRouter Doctor — system diagnostics + optional --fix.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const { getCliDataDir, DEFAULT_PORT } = require("../constants");
const { checkNodeVersion, formatBytes, parseArgs } = require("./doctorChecks");
const { getLanIp } = require("../utils/netUtils");
const {
  getLockFilePath,
  readLockPid,
  isPidAlive,
  clearStaleLock,
  resolvePort,
  resolveHost,
} = require("../utils/lifecycle");
const configStore = require("../utils/configStore");
const pkg = require("../../../package.json");


async function checkPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function checkHttpHealth(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode, body: body.slice(0, 200) });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: "timeout" });
    });
    req.on("error", (err) => {
      resolve({ ok: false, status: 0, error: err.message });
    });
  });
}


async function run(args = []) {
  const opts = parseArgs(args);
  if (opts.help) {
    console.log(`
Usage: hiperrouter doctor [--fix] [--port <n>]

  --fix, -f     Limpar lock stale e reinstalar runtime (SQLite/tray)
  --port, -p     Porta a checar (default: preferência ou ${DEFAULT_PORT})
`);
    return 0;
  }

  const port = resolvePort(opts.port);
  const host = resolveHost(null);
  const dataDir = getCliDataDir();
  const fix = opts.fix;
  let issueCount = 0;
  let warnCount = 0;
  let fixedCount = 0;

  console.log(`\n🩺 HiperRouter Doctor v${pkg.version}`);
  console.log(`=============================================\n`);
  if (fix) console.log(`🔧 Modo --fix ativo\n`);

  // 1. Node.js
  const nodeCheck = checkNodeVersion(process.version);
  console.log(nodeCheck.message);
  if (!nodeCheck.ok) issueCount++;

  // 2. DATA_DIR / permissions
  const envDataDir = process.env.DATA_DIR || null;
  console.log(`ℹ️  DATA_DIR env: ${envDataDir || "(não definido — usando default)"}`);
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const testFile = path.join(dataDir, ".doctor_test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    console.log(`✅ Data dir: ${dataDir} (leitura/escrita OK)`);
  } catch (err) {
    console.log(`❌ Data dir: ${dataDir} (${err.message})`);
    issueCount++;
  }

  // 3. SQLite DB
  const dbPath = path.join(dataDir, "db", "data.sqlite");
  if (fs.existsSync(dbPath)) {
    try {
      const stats = fs.statSync(dbPath);
      console.log(`✅ SQLite DB: ${dbPath} (${formatBytes(stats.size)})`);
    } catch (err) {
      console.log(`❌ SQLite DB: ${err.message}`);
      issueCount++;
    }
  } else {
    console.log(`ℹ️  SQLite DB: ainda não existe (${dbPath})`);
  }

  // 4. Standalone app bundle
  const cliRoot = path.resolve(__dirname, "../../..");
  const appDir = path.join(cliRoot, "app");
  const customServer = path.join(appDir, "custom-server.js");
  const serverJs = path.join(appDir, "server.js");
  if (fs.existsSync(customServer) || fs.existsSync(serverJs)) {
    let appVer = "?";
    try {
      const appPkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
      appVer = appPkg.version || "?";
    } catch {}
    console.log(`✅ App bundle: ${appDir} (v${appVer})`);
  } else {
    console.log(`❌ App bundle: ausente em ${appDir} (rode o build do CLI)`);
    issueCount++;
  }

  // 5. Runtime SQLite
  const { getRuntimeDir, getRuntimeNodeModules, ensureSqliteRuntime } = require("../../../hooks/sqliteRuntime");
  const runtimeDir = getRuntimeDir();
  const runtimeNm = getRuntimeNodeModules();
  const hasBetter = fs.existsSync(path.join(runtimeNm, "better-sqlite3", "package.json"));
  const hasSqlJs = fs.existsSync(path.join(runtimeNm, "sql.js", "package.json"))
    || fs.existsSync(path.join(appDir, "node_modules", "sql.js", "package.json"));

  if (hasBetter || hasSqlJs) {
    console.log(`✅ Runtime SQLite: ${runtimeDir} (better-sqlite3=${hasBetter ? "sim" : "não"}, sql.js=${hasSqlJs ? "sim" : "não"})`);
  } else {
    console.log(`⚠️  Runtime SQLite: deps ausentes em ${runtimeDir}`);
    warnCount++;
    if (fix) {
      try {
        const result = ensureSqliteRuntime({ silent: false });
        console.log(`   🔧 Reinstalado: better-sqlite3=${result.betterSqlite}, sql.js=${result.sqlJs}`);
        fixedCount++;
      } catch (e) {
        console.log(`   ❌ Falha ao reinstalar SQLite: ${e.message}`);
        issueCount++;
      }
    } else {
      console.log(`   Dica: hiperrouter doctor --fix`);
    }
  }

  // 6. Tray runtime
  const { ensureTrayRuntime } = require("../../../hooks/trayRuntime");
  if (process.platform === "win32") {
    console.log(`ℹ️  Tray: Windows usa NotifyIcon (sem systray2)`);
  } else {
    const hasTray = fs.existsSync(path.join(runtimeNm, "systray2", "package.json"));
    if (hasTray) {
      console.log(`✅ Tray runtime: systray2 presente`);
    } else {
      console.log(`⚠️  Tray runtime: systray2 ausente`);
      warnCount++;
      if (fix) {
        try {
          const result = ensureTrayRuntime({ silent: false });
          console.log(`   🔧 Tray: ${result.systray ? "OK" : "falhou / desabilitado"}`);
          if (result.systray) fixedCount++;
        } catch (e) {
          console.log(`   ❌ Falha ao instalar tray: ${e.message}`);
        }
      } else {
        console.log(`   Dica: hiperrouter doctor --fix`);
      }
    }
  }

  // 7. Process lock
  const lockFile = getLockFilePath();
  const pid = readLockPid();
  if (pid) {
    if (isPidAlive(pid)) {
      console.log(`🟢 CLI lock: ativo (PID ${pid})`);
    } else {
      console.log(`⚠️  CLI lock: stale (PID ${pid} morto) → ${lockFile}`);
      warnCount++;
      if (fix) {
        if (clearStaleLock()) {
          console.log(`   🔧 Lock stale removido`);
          fixedCount++;
        }
      } else {
        console.log(`   Dica: hiperrouter doctor --fix`);
      }
    }
  } else {
    console.log(`⚪ CLI lock: nenhum`);
  }

  // 8. Port + HTTP health
  const portOpen = await checkPortOpen(port);
  if (portOpen) {
    console.log(`✅ Porta ${port}: em escuta`);
    const health = await checkHttpHealth(port);
    if (health.ok) {
      console.log(`✅ Health /api/health: HTTP ${health.status}`);
    } else {
      console.log(`⚠️  Health /api/health: ${health.error || `HTTP ${health.status}`} (TCP ok, HTTP falhou)`);
      warnCount++;
    }
  } else {
    console.log(`⚪ Porta ${port}: livre (gateway offline ou outra porta)`);
  }

  // 9. Config prefs
  console.log(`ℹ️  Preferências: host=${host}, port=${port}, selfHeal=${configStore.get("selfHeal", false) ? "on" : "off"}`);
  const lanIp = getLanIp();
  if (host === "0.0.0.0") {
    console.log(`⚠️  Bind exposto na rede (LAN ${lanIp || "?"})`);
    warnCount++;
  } else {
    console.log(`🌐 LAN IP: ${lanIp || "n/a"} (bind local: ${host})`);
  }

  console.log(`\n=============================================`);
  if (fix && fixedCount > 0) {
    console.log(`🔧 Correções aplicadas: ${fixedCount}`);
  }
  if (issueCount === 0 && warnCount === 0) {
    console.log(`🎉 Diagnóstico OK — nenhum problema.\n`);
    return 0;
  }
  if (issueCount === 0) {
    console.log(`⚠️  ${warnCount} aviso(s). Críticos: 0.${fix ? "" : " Tente: hiperrouter doctor --fix"}\n`);
    return 0;
  }
  console.log(`❌ ${issueCount} problema(s) crítico(s), ${warnCount} aviso(s).\n`);
  return 1;
}

module.exports = { run, checkPortOpen, checkHttpHealth };
