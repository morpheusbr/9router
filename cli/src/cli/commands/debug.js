/**
 * hiperrouter debug <subcommand>
 *
 * Subcomandos:
 *   paths   — mostra todos os caminhos relevantes (DATA_DIR, config, lock, logs)
 *   config  — mostra o cli-config.json resolvido
 */
const path = require("path");
const os = require("os");
const { getCliDataDir } = require("../constants");
const { getConfigPath } = require("../utils/configStore");
const { getLockFilePath } = require("../utils/lifecycle");

const SUBCOMMANDS = ["paths", "config"];

function printHelp() {
  console.log(`
Uso: hiperrouter debug <subcomando>

Subcomandos:
  paths    Mostrar todos os caminhos do sistema (DATA_DIR, config, lock, logs)
  config   Mostrar configuração CLI resolvida (~/.HiperRouter/cli-config.json)

Opções:
  -h, --help   Mostrar ajuda
`);
}

function runPaths() {
  const dataDir = getCliDataDir();
  const configFile = getConfigPath();
  const lockFile = getLockFilePath();
  const logsDir = path.join(os.homedir(), ".HiperRouter");

  const paths = {
    "DATA_DIR":     dataDir,
    "cli-config":   configFile,
    "lock file":    lockFile,
    "logs/usage":   logsDir,
    "home":         os.homedir(),
    "platform":     process.platform,
    "node":         process.version,
  };

  console.log("\n📂 HiperRouter — caminhos do sistema\n");
  const maxLen = Math.max(...Object.keys(paths).map((k) => k.length));
  for (const [key, val] of Object.entries(paths)) {
    console.log(`  ${key.padEnd(maxLen)}  ${val}`);
  }
  console.log();
  return 0;
}

function runConfig() {
  const fs = require("fs");
  const configFile = getConfigPath();

  console.log(`\n⚙️  HiperRouter — configuração CLI\n`);
  console.log(`  Arquivo: ${configFile}\n`);

  if (!fs.existsSync(configFile)) {
    console.log("  (arquivo não existe — configurações padrão em uso)\n");
    return 0;
  }

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch (e) {
    console.error(`  ❌ Erro ao ler config: ${e.message}\n`);
    return 1;
  }

  if (Object.keys(cfg).length === 0) {
    console.log("  (vazio — configurações padrão em uso)\n");
    return 0;
  }

  console.log(JSON.stringify(cfg, null, 2));
  console.log();
  return 0;
}

async function run(args = []) {
  const sub = args[0];

  if (!sub || sub === "--help" || sub === "-h") {
    printHelp();
    return 0;
  }

  if (sub === "paths") return runPaths();
  if (sub === "config") return runConfig();

  console.error(`❌ Subcomando debug '${sub}' desconhecido. Disponíveis: ${SUBCOMMANDS.join(", ")}`);
  return 1;
}

module.exports = { run };
