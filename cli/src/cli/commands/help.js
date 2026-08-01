/**
 * Help command — lists all registered subcommands from the registry.
 */
const { APP_NAME, DEFAULT_PORT, DEFAULT_HOST } = require("../constants");
const pkg = require("../../../package.json");

function formatCommandLine(name, meta) {
  const desc = meta.description || "";
  const pad = name.padEnd(16);
  return `  ${pad} ${desc}`;
}

function printGlobalHelp(COMMANDS) {
  const entries = Object.entries(COMMANDS)
    .filter(([, meta]) => !meta.hidden)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const byCategory = new Map();
  for (const [name, meta] of entries) {
    const cat = meta.category || "Outros";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push([name, meta]);
  }

  // Preferred category order
  const order = [
    "Ciclo de vida",
    "Diagnóstico",
    "Gateway",
    "Ferramentas",
    "Agente",
    "Outros",
  ];
  const cats = [
    ...order.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !order.includes(c)).sort(),
  ];

  console.log(`
Usage: hiperrouter [options]
       hiperrouter <command> [args]

${APP_NAME} CLI v${pkg.version} — launcher do gateway e ferramentas.

Options:
  -p, --port <port>   Porta do servidor (default: ${DEFAULT_PORT})
  -H, --host <host>   Bind host (default: ${DEFAULT_HOST})
  -n, --no-browser    Não abrir o browser
  -l, --log           Mostrar logs do servidor
  -t, --tray          Modo system tray (background)
  -q, --quiet         Menos output
  --verbose           Debug
  --skip-update       Pular checagem de update
  -h, --help          Esta mensagem
  -v, --version       Versão

Commands:`);

  for (const cat of cats) {
    console.log(`\n  ${cat}:`);
    for (const [name, meta] of byCategory.get(cat)) {
      console.log(formatCommandLine(name, meta));
    }
  }

  console.log(`
Exemplos:
  hiperrouter start
  hiperrouter status
  hiperrouter stop
  hiperrouter doctor
  hiperrouter help sync
  hiperrouter --host 0.0.0.0   # expor na LAN
`);
}

function printCommandHelp(COMMANDS, cmdName) {
  const meta = COMMANDS[cmdName];
  if (!meta) {
    console.error(`Comando desconhecido: "${cmdName}"`);
    console.error(`Use: hiperrouter help`);
    return 1;
  }
  console.log(`\n${cmdName} — ${meta.description || ""}`);
  if (meta.usage) {
    console.log(`\nUsage:\n  ${meta.usage}`);
  }
  if (meta.examples?.length) {
    console.log(`\nExemplos:`);
    for (const ex of meta.examples) console.log(`  ${ex}`);
  }
  console.log();
  return 0;
}

async function run(args, COMMANDS) {
  const target = args[0];
  if (!target || target === "--help" || target === "-h") {
    printGlobalHelp(COMMANDS);
    return 0;
  }
  return printCommandHelp(COMMANDS, target);
}

module.exports = { run, printGlobalHelp, printCommandHelp };
