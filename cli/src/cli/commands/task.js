/**
 * hiperrouter task "<prompt>"
 * Invoca agentWorker.js com tool use real.
 */
const { spawn } = require("child_process");
const path = require("path");
const configStore = require("../utils/configStore");
const { resolvePort } = require("../utils/lifecycle");
const { getApiKeys, createApiKey } = require("../api/client");
const fs = require("fs");

async function resolveLocalApiKey() {
  const cached = configStore.get("localApiKey");
  if (cached) return cached;

  process.stderr.write("🔑 Buscando API key no gateway...\n");

  const listRes = await getApiKeys();
  if (listRes.success && listRes.data?.keys?.length > 0) {
    const active = listRes.data.keys.find((k) => k.isActive);
    if (active) {
      configStore.set("localApiKey", active.key);
      return active.key;
    }
  }

  process.stderr.write("🔑 Criando nova API key para o CLI...\n");
  const createRes = await createApiKey("HiperRouter CLI");
  if (createRes.success && createRes.data?.key) {
    configStore.set("localApiKey", createRes.data.key);
    return createRes.data.key;
  }
  return null;
}

async function run(args) {
  const opts = { model: null, port: null, maxIter: null, cwd: null, timeout: null, json: false, dryRun: false };
  const promptParts = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === "--model" || a === "-m") && args[i + 1])       opts.model   = args[++i];
    else if ((a === "--port"  || a === "-p") && args[i + 1])  opts.port    = args[++i];
    else if ((a === "--iter"  || a === "-n") && args[i + 1])  opts.maxIter = args[++i];
    else if (a === "--cwd" && args[i + 1])                    opts.cwd     = args[++i];
    else if (a === "--timeout" && args[i + 1])                 opts.timeout = args[++i];
    else if (a === "--json")                                  opts.json = true;
    else if (a === "--dry-run")                               opts.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(`
Uso: hiperrouter task "<prompt>" [opções]

  -m, --model <id>    Modelo (default: defaultModel do config)
  -p, --port  <n>     Porta do gateway (default: 20128)
  -n, --iter  <n>     Máximo de iterações (default: 20)
      --cwd   <dir>   Diretório de trabalho (default: cwd atual)
      --timeout <ms>   Timeout por comando (default: 15000)
      --json           Saída estruturada para CI/automação
      --dry-run        Não executa comandos nem altera arquivos
  -h, --help          Mostrar ajuda

Exemplos:
  hiperrouter task "explique este repo"
  hiperrouter task "adicione testes para configStore.js" --model gc/gemini-2.5-pro
  hiperrouter task "refatore style.css" --cwd /home/www/meu-projeto
`);
      return 0;
    } else {
      promptParts.push(a);
    }
  }

  const taskPrompt = promptParts.join(" ").trim();
  if (!taskPrompt) {
    console.error('❌ Uso: hiperrouter task "<prompt>"');
    return 1;
  }

  if (opts.port !== null && (!/^\d+$/.test(String(opts.port)) || Number(opts.port) < 1 || Number(opts.port) > 65535)) {
    console.error("❌ --port deve ser um número entre 1 e 65535.");
    return 1;
  }
  const port    = resolvePort(opts.port === null ? null : Number(opts.port));
  const model   = opts.model   || configStore.get("defaultModel", "meu-combo");
  const maxIter = Number(opts.maxIter || 20);
  const cwd     = opts.cwd     || process.cwd();

  if (!Number.isInteger(maxIter) || maxIter < 1 || maxIter > 100) {
    console.error("❌ --iter deve ser um inteiro entre 1 e 100.");
    return 1;
  }
  const timeout = Number(opts.timeout || 15000);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 600000) {
    console.error("❌ --timeout deve ser um inteiro entre 100 e 600000 ms.");
    return 1;
  }
  let resolvedCwd;
  try {
    resolvedCwd = fs.realpathSync(cwd);
    if (!fs.statSync(resolvedCwd).isDirectory()) throw new Error("não é um diretório");
  } catch (error) {
    console.error(`❌ --cwd inválido: ${cwd} (${error.message})`);
    return 1;
  }

  const apiKey = await resolveLocalApiKey();
  if (!apiKey) {
    console.error("❌ Não foi possível obter API key. Gateway rodando? hiperrouter status");
    return 1;
  }

  const workerPath = path.join(__dirname, "agentWorker.js");

  return new Promise((resolve) => {
    const worker = spawn(process.execPath, [workerPath], {
      cwd: resolvedCwd,
      stdio: "inherit",
      env: {
        ...process.env,
        HIPERROUTER_API_KEY:  apiKey,
        HIPERROUTER_PORT:     String(port),
        HIPERROUTER_MODEL:    model,
        HIPERROUTER_PROMPT:   taskPrompt,
        HIPERROUTER_CWD:      resolvedCwd,
        HIPERROUTER_MAX_ITER: String(maxIter),
        HIPERROUTER_COMMAND_TIMEOUT: String(timeout),
        HIPERROUTER_JSON: opts.json ? "1" : "0",
        HIPERROUTER_DRY_RUN: opts.dryRun ? "1" : "0",
      },
    });

    worker.on("close", (code) => resolve(code || 0));
    worker.on("error", (e) => {
      console.error(`❌ Falha ao iniciar agente: ${e.message}`);
      resolve(1);
    });
  });
}

module.exports = { run, resolveLocalApiKey };
