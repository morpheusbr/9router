/**
 * Gateway lifecycle subcommands: start | stop | status | restart
 */
const { waitServerReady } = require("../utils/netUtils");
const {
  getStatus,
  stopGateway,
  startDetached,
  clearStaleLock,
  resolvePort,
  resolveHost,
} = require("../utils/lifecycle");

function parseLifecycleArgs(args = []) {
  const opts = { port: null, host: null, quiet: false, force: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === "--port" || a === "-p") && args[i + 1]) {
      opts.port = parseInt(args[++i], 10);
    } else if ((a === "--host" || a === "-H") && args[i + 1]) {
      opts.host = args[++i];
    } else if (a === "--quiet" || a === "-q") {
      opts.quiet = true;
    } else if (a === "--force" || a === "-f") {
      opts.force = true;
    }
  }
  return opts;
}

async function runStatus(args = []) {
  const opts = parseLifecycleArgs(args);
  const status = await getStatus(opts);

  if (status.staleLock) {
    console.log(`⚠️  Lock stale em ${status.lockFile} — limpando...`);
    clearStaleLock();
  }

  if (status.running || status.ready) {
    console.log(`🟢 HiperRouter: em execução`);
    if (status.pid) console.log(`   PID:    ${status.pid}`);
    console.log(`   Porta:  ${status.port}`);
    console.log(`   Host:   ${status.host}`);
    console.log(`   Ready:  ${status.ready ? "sim" : "aguardando"}`);
    console.log(`   URL:    http://${status.host === "0.0.0.0" ? "127.0.0.1" : status.host}:${status.port}/dashboard`);
    return 0;
  }

  console.log(`⚪ HiperRouter: parado`);
  console.log(`   Porta:  ${status.port} (livre ou outro serviço)`);
  console.log(`   Host:   ${status.host}`);
  console.log(`   Lock:   ${status.lockFile}`);
  return 1;
}

async function runStop(args = []) {
  const opts = parseLifecycleArgs(args);
  const before = await getStatus(opts);
  if (!before.running && !before.ready && !before.staleLock) {
    console.log(`ℹ️  HiperRouter já está parado.`);
    return 0;
  }

  console.log(`⏹  Parando HiperRouter...`);
  const result = await stopGateway(opts);
  console.log(result.stopped ? `✅ ${result.message}` : `❌ ${result.message}`);
  return result.stopped ? 0 : 1;
}

async function runStart(args = []) {
  const opts = parseLifecycleArgs(args);
  clearStaleLock();

  const before = await getStatus(opts);
  if (before.running || before.ready) {
    console.log(`ℹ️  HiperRouter já está em execução${before.pid ? ` (PID ${before.pid})` : ""}.`);
    console.log(`   Use: hiperrouter status | hiperrouter stop`);
    return 0;
  }

  const port = resolvePort(opts.port);
  const host = resolveHost(opts.host);
  console.log(`🚀 Iniciando HiperRouter em background (porta ${port}, host ${host})...`);

  const { pid } = startDetached({ ...opts, port, host });
  console.log(`   Spawn PID: ${pid}`);

  try {
    const ready = await waitServerReady(port, { timeoutMs: 45000, intervalMs: 250 });
    if (ready) {
      const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
      console.log(`✅ Pronto: http://${displayHost}:${port}/dashboard`);
      console.log(`   status: hiperrouter status`);
      console.log(`   stop:   hiperrouter stop`);
      return 0;
    }
  } catch {}

  console.log(`⚠️  Processo iniciado (PID ${pid}), mas o health-check ainda não respondeu.`);
  console.log(`   Verifique: hiperrouter status | hiperrouter logs`);
  return 0;
}

async function runRestart(args = []) {
  const opts = parseLifecycleArgs(args);
  console.log(`🔄 Reiniciando HiperRouter...`);
  await stopGateway(opts);
  // breve pausa para liberar porta
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); } catch {}
  return runStart(args);
}

module.exports = {
  runStart,
  runStop,
  runStatus,
  runRestart,
  parseLifecycleArgs,
};
