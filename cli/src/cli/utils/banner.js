/**
 * Startup banner with ASCII art and version info.
 */

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};

function showBanner(version, port) {
  const art = `${COLORS.cyan}
  ╦ ╦╦╔═╗╔═╗╦═╗╔═╗╔═╗╔╦╗
  ╠═╣║╚═╗║╣ ╠╦╝║  ╠═╣ ║║
  ╩ ╩╩╚═╝╚═╝╩╚═╚═╝╩ ╩═╩╝${COLORS.reset}`;

  console.log(art);
  console.log(`  ${COLORS.dim}v${version}${COLORS.reset}  ${COLORS.dim}port ${port}${COLORS.reset}`);
  console.log();
}

function showQuickHelp() {
  console.log(`${COLORS.dim}Quick start:${COLORS.reset}`);
  console.log(`  ${COLORS.cyan}/help${COLORS.reset}        Show all commands`);
  console.log(`  ${COLORS.cyan}/model${COLORS.reset}       Switch AI model`);
  console.log(`  ${COLORS.cyan}/menu${COLORS.reset}        Open management TUI`);
  console.log(`  ${COLORS.cyan}Ctrl+K${COLORS.reset}       Command palette`);
  console.log(`  ${COLORS.cyan}Ctrl+L${COLORS.reset}       Clear screen`);
  console.log(`  ${COLORS.cyan}/exit${COLORS.reset}        Quit`);
  console.log();
}

module.exports = { showBanner, showQuickHelp };
