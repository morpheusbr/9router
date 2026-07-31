/**
 * Command registry for HiperRouter subcommands.
 * Dispatches subcommands (`hiperrouter xai video`, `hiperrouter sync`, etc.)
 */
const COMMANDS = {
  xai: {
    run: async (args) => {
      if (args[0] === "video") {
        const { run } = require("./xaiVideo");
        return run(args.slice(1));
      }
      throw new Error(`Subcomando xai '${args[0] || ""}' desconhecido. Use 'hiperrouter xai video'.`);
    }
  },
  sync: {
    run: async (args) => {
      const { run } = require("./sync");
      return run(args);
    }
  },
  alias: {
    run: async (args) => {
      const { run } = require("./alias");
      return run(args);
    }
  },
  personas: {
    run: async (args) => {
      const { run } = require("./personas");
      return run(args);
    }
  },
  playground: {
    run: async (args) => {
      const { run } = require("./playground");
      return run(args);
    }
  },
  vacuum: {
    run: async (args) => {
      const { run } = require("./vacuum");
      return run(args);
    }
  },
  logs: {
    run: async (args) => {
      const { run } = require("./logs");
      return run(args);
    }
  },
  keyHealth: {
    run: async (args) => {
      const { run } = require("./keyHealth");
      return run(args);
    }
  },
  websearch: {
    run: async (args) => {
      const { run } = require("./websearch");
      return run(args);
    }
  },
  pack: {
    run: async (args) => {
      const { run } = require("./pack");
      return run(args);
    }
  },
  security: {
    run: async (args) => {
      const { run } = require("./security");
      return run(args);
    }
  },
  "run-tests": {
    run: async (args) => {
      const { run } = require("./testRunner");
      return run(args);
    }
  },
  architecture: {
    run: async (args) => {
      const { run } = require("./architecture");
      return run(args);
    }
  },
  consensus: {
    run: async (args) => {
      const { run } = require("./consensus");
      return run(args);
    }
  },
  watcher: {
    run: async (args) => {
      const { run } = require("./watcher");
      return run(args);
    }
  },
  deps: {
    run: async (args) => {
      const { run } = require("./deps");
      return run(args);
    }
  },
  changelog: {
    run: async (args) => {
      const { run } = require("./changelog");
      return run(args);
    }
  },
  tokensaver: {
    run: async (args) => {
      const { run } = require("./tokensaver");
      return run(args);
    }
  },
  translator: {
    run: async (args) => {
      const { run } = require("./translator");
      return run(args);
    }
  },
  media: {
    run: async (args) => {
      const { run } = require("./media");
      return run(args);
    }
  },
  quota: {
    run: async (args) => {
      const { run } = require("./quota");
      return run(args);
    }
  },
  consolelog: {
    run: async (args) => {
      const { run } = require("./consoleLog");
      return run(args);
    }
  },
  endpoint: {
    run: async (args) => {
      const { run } = require("./endpoint");
      return run(args);
    }
  },
  task: {
    run: async (args) => {
      const { run } = require("./task");
      return run(args);
    }
  },
  doctor: {
    run: async (args) => {
      const { run } = require("./doctor");
      return run(args);
    }
  },
  key: {
    run: async (args) => {
      const { run } = require("./key");
      return run(args);
    }
  },
  stats: {
    run: async (args) => {
      const { run } = require("./stats");
      return run(args);
    }
  },
  completion: {
    run: async (args) => {
      const { run } = require("./completion");
      return run(args);
    }
  },
  backup: {
    run: async (args) => {
      const { run } = require("./backup");
      return run(args);
    }
  },
  menu: {
    run: async (args) => {
      const { run } = require("./menu");
      return run(args);
    }
  },
  model: {
    run: async (args) => {
      const { run } = require("./model");
      return run(args);
    }
  },
  mcp: {
    run: async (args) => {
      const { run } = require("./mcp");
      return run(args);
    }
  },
  benchmark: {
    run: async (args) => {
      const { run } = require("./benchmark");
      return run(args);
    }
  },
  tunnel: {
    run: async (args) => {
      const { run } = require("./tunnel");
      return run(args);
    }
  },
  memory: {
    run: async (args) => {
      const { run } = require("./memory");
      return run(args);
    }
  }
};

/**
 * Executes a subcommand if registered.
 * @param {string[]} args Command arguments
 * @returns {Promise<boolean>} True if handled, false if not a registered subcommand
 */
async function dispatchSubcommand(args) {
  if (!args || args.length === 0) return false;
  const cmdName = args[0];
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

module.exports = {
  COMMANDS,
  dispatchSubcommand,
};
