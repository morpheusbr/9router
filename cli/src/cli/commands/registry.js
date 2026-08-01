/**
 * Command registry for HiperRouter subcommands.
 * Dispatches subcommands (`hiperrouter xai video`, `hiperrouter sync`, etc.)
 *
 * Each entry: { run, description, usage?, category?, examples?, hidden? }
 */
const COMMANDS = {
  help: {
    description: "Listar comandos ou ajuda de um comando",
    usage: "hiperrouter help [comando]",
    category: "Ciclo de vida",
    examples: ["hiperrouter help", "hiperrouter help sync"],
    run: async (args) => {
      const { run } = require("./help");
      return run(args, COMMANDS);
    },
  },
  start: {
    description: "Iniciar gateway em background (tray)",
    usage: "hiperrouter start [--port <n>] [--host <h>]",
    category: "Ciclo de vida",
    examples: ["hiperrouter start", "hiperrouter start --port 20128"],
    run: async (args) => {
      const { runStart } = require("./lifecycle");
      return runStart(args);
    },
  },
  stop: {
    description: "Parar gateway e processos relacionados",
    usage: "hiperrouter stop [--port <n>] [--force]",
    category: "Ciclo de vida",
    examples: ["hiperrouter stop", "hiperrouter stop --force"],
    run: async (args) => {
      const { runStop } = require("./lifecycle");
      return runStop(args);
    },
  },
  status: {
    description: "Ver se o gateway está rodando",
    usage: "hiperrouter status [--port <n>]",
    category: "Ciclo de vida",
    examples: ["hiperrouter status"],
    run: async (args) => {
      const { runStatus } = require("./lifecycle");
      return runStatus(args);
    },
  },
  restart: {
    description: "Parar e iniciar o gateway",
    usage: "hiperrouter restart [--port <n>] [--host <h>]",
    category: "Ciclo de vida",
    examples: ["hiperrouter restart"],
    run: async (args) => {
      const { runRestart } = require("./lifecycle");
      return runRestart(args);
    },
  },
  debug: {
    description: "Ferramentas de diagnóstico (paths, config)",
    usage: "hiperrouter debug <paths|config>",
    category: "Diagnóstico",
    examples: ["hiperrouter debug paths", "hiperrouter debug config"],
    run: async (args) => {
      const { run } = require("./debug");
      return run(args);
    },
  },
  doctor: {
    description: "Diagnóstico (Node, SQLite, portas, permissões)",
    usage: "hiperrouter doctor",
    category: "Diagnóstico",
    run: async (args) => {
      const { run } = require("./doctor");
      return run(args);
    },
  },
  logs: {
    description: "Stream de logs de uso em tempo real",
    usage: "hiperrouter logs",
    category: "Diagnóstico",
    run: async (args) => {
      const { run } = require("./logs");
      return run(args);
    },
  },
  consolelog: {
    description: "Console log do gateway",
    usage: "hiperrouter consolelog",
    category: "Diagnóstico",
    run: async (args) => {
      const { run } = require("./consoleLog");
      return run(args);
    },
  },
  sync: {
    description: "Configurar VSCode, Kilo, OpenCode ou Cursor",
    usage: "hiperrouter sync [tool]",
    category: "Gateway",
    examples: ["hiperrouter sync", "hiperrouter sync cursor"],
    run: async (args) => {
      const { run } = require("./sync");
      return run(args);
    },
  },
  endpoint: {
    description: "Mostrar URLs OpenAI/Anthropic do gateway",
    usage: "hiperrouter endpoint",
    category: "Gateway",
    run: async (args) => {
      const { run } = require("./endpoint");
      return run(args);
    },
  },
  key: {
    description: "Gerenciar API keys de providers",
    usage: "hiperrouter key <list|add|rm> ...",
    category: "Gateway",
    run: async (args) => {
      const { run } = require("./key");
      return run(args);
    },
  },
  keyHealth: {
    description: "Checar saúde das API keys",
    usage: "hiperrouter keyHealth",
    category: "Gateway",
    run: async (args) => {
      const { run } = require("./keyHealth");
      return run(args);
    },
  },
  alias: {
    description: "Aliases de modelos (list|set|rm)",
    usage: "hiperrouter alias <list|set|rm> ...",
    category: "Gateway",
    examples: ["hiperrouter alias list", "hiperrouter alias set fast gpt-4o-mini"],
    run: async (args) => {
      const { run } = require("./alias");
      return run(args);
    },
  },
  model: {
    description: "Selecionar / listar modelos",
    usage: "hiperrouter model",
    category: "Gateway",
    run: async (args) => {
      const { run } = require("./model");
      return run(args);
    },
  },
  quota: {
    description: "Quota e consumo de providers",
    usage: "hiperrouter quota",
    category: "Gateway",
    run: async (args) => {
      const { run } = require("./quota");
      return run(args);
    },
  },
  stats: {
    description: "Telemetria de uso e tokens",
    usage: "hiperrouter stats",
    category: "Gateway",
    run: async (args) => {
      const { run } = require("./stats");
      return run(args);
    },
  },
  backup: {
    description: "Backup / restore de dados",
    usage: "hiperrouter backup [create|restore]",
    category: "Gateway",
    run: async (args) => {
      const { run } = require("./backup");
      return run(args);
    },
  },
  vacuum: {
    description: "Vacuum do banco SQLite",
    usage: "hiperrouter vacuum",
    category: "Gateway",
    run: async (args) => {
      const { run } = require("./vacuum");
      return run(args);
    },
  },
  tunnel: {
    description: "Status / controle de túnel (cloudflared/tailscale)",
    usage: "hiperrouter tunnel",
    category: "Gateway",
    run: async (args) => {
      const { run } = require("./tunnel");
      return run(args);
    },
  },
  mcp: {
    description: "Gerenciar servidores MCP",
    usage: "hiperrouter mcp",
    category: "Gateway",
    run: async (args) => {
      const { run } = require("./mcp");
      return run(args);
    },
  },
  security: {
    description: "Auditoria estática de segurança (SAST)",
    usage: "hiperrouter security [path]",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./security");
      return run(args);
    },
  },
  tokensaver: {
    description: "Status do RTK Token Saver",
    usage: "hiperrouter tokensaver",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./tokensaver");
      return run(args);
    },
  },
  translator: {
    description: "Status do tradutor de formatos",
    usage: "hiperrouter translator",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./translator");
      return run(args);
    },
  },
  media: {
    description: "Ferramentas de mídia",
    usage: "hiperrouter media",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./media");
      return run(args);
    },
  },
  websearch: {
    description: "Busca web via gateway",
    usage: "hiperrouter websearch <query>",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./websearch");
      return run(args);
    },
  },
  pack: {
    description: "Empacotar CLI localmente",
    usage: "hiperrouter pack",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./pack");
      return run(args);
    },
  },
  deps: {
    description: "Checar / instalar deps de runtime",
    usage: "hiperrouter deps",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./deps");
      return run(args);
    },
  },
  changelog: {
    description: "Changelog recente",
    usage: "hiperrouter changelog",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./changelog");
      return run(args);
    },
  },
  completion: {
    description: "Gerar autocomplete bash/zsh",
    usage: "hiperrouter completion [bash|zsh]",
    category: "Ferramentas",
    examples: ["hiperrouter completion zsh"],
    run: async (args) => {
      const { run } = require("./completion");
      return run(args);
    },
  },
  benchmark: {
    description: "Benchmark de latência dos modelos",
    usage: "hiperrouter benchmark",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./benchmark");
      return run(args);
    },
  },
  architecture: {
    description: "Gerar diagrama de arquitetura (Mermaid)",
    usage: "hiperrouter architecture",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./architecture");
      return run(args);
    },
  },
  "run-tests": {
    description: "Rodar testes com auto-fix",
    usage: "hiperrouter run-tests",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./testRunner");
      return run(args);
    },
  },
  watcher: {
    description: "Watcher de arquivos / hot reload helpers",
    usage: "hiperrouter watcher",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./watcher");
      return run(args);
    },
  },
  menu: {
    description: "Abrir menu TUI de gerenciamento",
    usage: "hiperrouter menu",
    category: "Ferramentas",
    run: async (args) => {
      const { run } = require("./menu");
      return run(args);
    },
  },
  task: {
    description: "Rodar agente headless em background",
    usage: 'hiperrouter task "<prompt>"',
    category: "Agente",
    examples: ['hiperrouter task "explique este repo"'],
    run: async (args) => {
      const { run } = require("./task");
      return run(args);
    },
  },
  personas: {
    description: "Gerenciar personas do agente",
    usage: "hiperrouter personas",
    category: "Agente",
    run: async (args) => {
      const { run } = require("./personas");
      return run(args);
    },
  },
  playground: {
    description: "Playground multi-modelo",
    usage: "hiperrouter playground",
    category: "Agente",
    run: async (args) => {
      const { run } = require("./playground");
      return run(args);
    },
  },
  consensus: {
    description: "Consensus engine multi-modelo",
    usage: "hiperrouter consensus",
    category: "Agente",
    run: async (args) => {
      const { run } = require("./consensus");
      return run(args);
    },
  },
  memory: {
    description: "Memória / contexto do agente",
    usage: "hiperrouter memory",
    category: "Agente",
    run: async (args) => {
      const { run } = require("./memory");
      return run(args);
    },
  },
  xai: {
    description: "Grok Imagine video (xai video)",
    usage: 'hiperrouter xai video --prompt "..." --output video.mp4',
    category: "Agente",
    examples: ['hiperrouter xai video --help'],
    run: async (args) => {
      if (args[0] === "video") {
        const { run } = require("./xaiVideo");
        return run(args.slice(1));
      }
      throw new Error(`Subcomando xai '${args[0] || ""}' desconhecido. Use 'hiperrouter xai video'.`);
    },
  },
};

/**
 * Executes a subcommand if registered.
 * @param {string[]} args Command arguments
 * @returns {Promise<boolean>} True if handled, false if not a registered subcommand
 */
async function dispatchSubcommand(args) {
  if (!args || args.length === 0) return false;
  const cmdName = args[0];

  // Treat bare --help / -h as help command when it's the only/first intentional help request
  // (cli.js also handles --help among flags; this covers `hiperrouter help`)
  if (cmdName === "help" || cmdName === "--help") {
    const { run } = require("./help");
    const exitCode = await run(cmdName === "help" ? args.slice(1) : [], COMMANDS);
    process.exit(exitCode || 0);
    return true;
  }

  const command = COMMANDS[cmdName];
  if (!command) return false;

  try {
    const exitCode = await command.run(args.slice(1));
    process.exit(exitCode || 0);
  } catch (err) {
    console.error(`❌ ${err?.message || err}`);
    process.exit(1);
  }
  return true;
}

function listCommandNames() {
  return Object.keys(COMMANDS).filter((k) => !COMMANDS[k].hidden);
}

module.exports = {
  COMMANDS,
  dispatchSubcommand,
  listCommandNames,
};
