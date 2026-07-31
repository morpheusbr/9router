const fs = require("fs");
const path = require("path");
const net = require("net");
const { getCliDataDir, DEFAULT_PORT } = require("../constants");
const { getLanIp } = require("../utils/netUtils");

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

async function run(args) {
  console.log(`\n🩺 HiperRouter Doctor - Diagnóstico do Sistema`);
  console.log(`=============================================\n`);

  let issueCount = 0;

  // 1. Check Node.js Version
  const nodeVer = process.version;
  const major = parseInt(nodeVer.replace("v", "").split(".")[0], 10);
  if (major >= 18) {
    console.log(`✅ Node.js Version: ${nodeVer} (OK)`);
  } else {
    console.log(`❌ Node.js Version: ${nodeVer} (Requer Node.js >= 18)`);
    issueCount++;
  }

  // 2. Check Data Directory & Permissions
  const dataDir = getCliDataDir();
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const testFile = path.join(dataDir, ".doctor_test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    console.log(`✅ Data Directory: ${dataDir} (Leitura/Escrita OK)`);
  } catch (err) {
    console.log(`❌ Data Directory: ${dataDir} (Erro de Permissão: ${err.message})`);
    issueCount++;
  }

  // 3. Check SQLite DB File
  const dbPath = path.join(dataDir, "db", "data.sqlite");
  if (fs.existsSync(dbPath)) {
    try {
      const stats = fs.statSync(dbPath);
      console.log(`✅ Database SQLite: ${dbPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (err) {
      console.log(`❌ Database SQLite: ${dbPath} (Erro: ${err.message})`);
      issueCount++;
    }
  } else {
    console.log(`ℹ️  Database SQLite: Não encontrado ainda em ${dbPath} (Será criado ao iniciar o servidor)`);
  }

  // 4. Check Process Lock
  const lockFile = path.join(dataDir, ".cli.pid");
  if (fs.existsSync(lockFile)) {
    try {
      const pid = parseInt(fs.readFileSync(lockFile, "utf8").trim(), 10);
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {}

      if (alive) {
        console.log(`🟢 HiperRouter Server: Rodando (PID ${pid})`);
      } else {
        console.log(`⚠️  HiperRouter Lock: Arquivo de lock estático detectado (PID ${pid} não está rodando). Pode remover: ${lockFile}`);
      }
    } catch (e) {
      console.log(`⚠️  HiperRouter Lock: Erro ao ler lockfile.`);
    }
  } else {
    console.log(`⚪ HiperRouter Server: Parado (Nenhum processo ativo em lock)`);
  }

  // 5. Check Network & Port
  const isPortActive = await checkPortOpen(DEFAULT_PORT);
  if (isPortActive) {
    console.log(`✅ Porta de Serviço (${DEFAULT_PORT}): Aberta / Em escuta`);
  } else {
    console.log(`⚪ Porta de Serviço (${DEFAULT_PORT}): Livre (Servidor offline ou escutando em outra porta)`);
  }

  const lanIp = getLanIp();
  console.log(`🌐 IP de Rede Local (LAN): ${lanIp || "127.0.0.1"}`);

  console.log(`\n=============================================`);
  if (issueCount === 0) {
    console.log(`🎉 Diagnóstico concluído: Nenhum problema crítico encontrado!\n`);
    return 0;
  } else {
    console.log(`⚠️  Diagnóstico concluído com ${issueCount} problema(s) que precisam de atenção.\n`);
    return 1;
  }
}

module.exports = { run };
