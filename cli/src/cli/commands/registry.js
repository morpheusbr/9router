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
  task: {
    run: async (args) => {
      const { run } = require("./task");
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
