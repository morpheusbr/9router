const api = require("./api/client");
const { showMenuWithBack } = require("./utils/menuHelper");
const { showProvidersMenu } = require("./menus/providers");
const { showApiKeysMenu } = require("./menus/apiKeys");
const { showCombosMenu } = require("./menus/combos");
const { showSettingsMenu } = require("./menus/settings");
const { showCliToolsMenu } = require("./menus/cliTools");

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m"
};

// Cached header (SWR): show last value instantly, refresh in background.
let cachedHeader = "";
let fetchingHeader = false;

function renderHeader(port, keys, tunnel) {
  const tunnelEnabled = tunnel && tunnel.enabled === true;
  const lines = [];
  if (tunnelEnabled && tunnel.publicUrl) {
    lines.push(`Endpoint: ${COLORS.green}${tunnel.publicUrl}/v1${COLORS.reset}`);
    lines.push(`Tunnel:   ${COLORS.green}ON${COLORS.reset} ${COLORS.dim}(${tunnel.shortId})${COLORS.reset}`);
  } else {
    lines.push(`Endpoint: http://localhost:${port}/v1`);
    lines.push(`Tunnel:   ${COLORS.red}OFF${COLORS.reset} ${COLORS.dim}(local only)${COLORS.reset}`);
  }
  if (!keys || keys.length === 0) {
    lines.push(`Key:      ${COLORS.dim}No API keys yet${COLORS.reset}`);
  } else {
    lines.push(`Key:      ${COLORS.cyan}${keys[0].key}${COLORS.reset}`);
    keys.slice(1).forEach(k => lines.push(`          ${COLORS.cyan}${k.key}${COLORS.reset}`));
  }
  return lines.join("\n");
}

async function refreshHeaderBg(port) {
  if (fetchingHeader) return;
  fetchingHeader = true;
  try {
    const [keysResult, tunnelResult] = await Promise.all([
      api.getApiKeys(),
      api.getTunnelStatus()
    ]);
    const keys = keysResult.success ? (keysResult.data.keys || []) : [];
    const tunnel = tunnelResult.success ? (tunnelResult.data || {}) : {};
    cachedHeader = renderHeader(port, keys, tunnel);
  } finally {
    fetchingHeader = false;
  }
}

function getHeader(port) {
  // Kick off background refresh; return cache (or placeholder on first call).
  refreshHeaderBg(port);
  const content = cachedHeader || `Endpoint: http://localhost:${port}/v1\nTunnel:   ${COLORS.dim}...${COLORS.reset}\nKey:      ${COLORS.dim}...${COLORS.reset}`;

  // Create a beautiful bordered block for the server info
  const lines = content.split('\n');
  const innerWidth = 56;
  const topLeft = "╭", topRight = "╮", botLeft = "╰", botRight = "╯", horiz = "─", vert = "│";

  let box = `${COLORS.cyan}${topLeft}${horiz.repeat(innerWidth)}${topRight}${COLORS.reset}\n`;
  lines.forEach(l => {
    const cleanL = l.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, innerWidth - cleanL.length - 2);
    box += `${COLORS.cyan}${vert}${COLORS.reset} ${l}${" ".repeat(pad)} ${COLORS.cyan}${vert}${COLORS.reset}\n`;
  });
  box += `${COLORS.cyan}${botLeft}${horiz.repeat(innerWidth)}${botRight}${COLORS.reset}`;

  return box;
}

/**
 * Start Terminal UI
 * @param {number} port - Server port number
 */
async function startTerminalUI(port) {
  // Configure API client
  api.configure({ port });

  const basePath = ["HiperRouter"];

  // Prime header cache before first render
  await refreshHeaderBg(port);

  // Main menu
  await showMenuWithBack({
    title: "📡 HiperRouter Terminal UI",
    breadcrumb: basePath,
    headerContent: () => getHeader(port),
    items: [
      {
        label: "Chat (Interactive)",
        action: async () => {
          const { startChatUI } = require("./chatUI");
          await startChatUI(port);
          return true; // Continue
        }
      },
      {
        label: "Providers",
        action: async () => {
          await showProvidersMenu([...basePath, "Providers"]);
          return true; // Continue
        }
      },
      {
        label: "API Keys",
        action: async () => {
          await showApiKeysMenu(port, [...basePath, "API Keys"]);
          return true;
        }
      },
      {
        label: "Combos",
        action: async () => {
          await showCombosMenu([...basePath, "Combos"]);
          return true;
        }
      },
      {
        label: "CLI Tools",
        action: async () => {
          await showCliToolsMenu(port, [...basePath, "CLI Tools"]);
          return true;
        }
      },
      {
        label: "Settings",
        action: async () => {
          await showSettingsMenu([...basePath, "Settings"]);
          return true;
        }
      }
    ],
    backLabel: "← Back to Interface Menu"
  });
}

module.exports = { startTerminalUI };
