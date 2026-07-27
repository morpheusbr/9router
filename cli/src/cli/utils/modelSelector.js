const api = require("../api/client");
const { selectMenu, COLORS } = require("./input");
const { DEFAULT_PORT } = require("../constants");
const configStore = require("./configStore");

const PROVIDER_ALIAS_NAMES = {
  cc: "Claude Code", ag: "Antigravity", cx: "OpenAI Codex", if: "iFlow AI",
  qw: "Qwen Code", gc: "Gemini CLI", gh: "GitHub Copilot", kr: "Kiro AI",
  openrouter: "OpenRouter", glm: "GLM Coding", kimi: "Kimi Coding",
  minimax: "Minimax Coding", openai: "OpenAI", anthropic: "Anthropic",
  gemini: "Gemini"
};

const PROVIDER_ICONS = {
  cc: "🟣", ag: "🚀", cx: "🟢", if: "🔵", qw: "🟠", gc: "💎", gh: "🐙",
  kr: "🔶", openrouter: "🌐", glm: "🧠", kimi: "🌙", minimax: "⚡",
  openai: "🤖", anthropic: "🏛️", gemini: "✨"
};

const PROVIDER_ALIAS_ORDER = [
  "cc", "ag", "cx", "if", "qw", "gc", "gh", "kr",
  "openrouter", "glm", "kimi", "minimax", "openai", "anthropic", "gemini"
];

async function getConnectedProviders() {
  const result = await api.getProviders();
  if (!result.success) return [];
  return (result.data?.connections || []).filter(c => c.isActive !== false);
}

async function getAvailableModelsGrouped() {
  const result = await api.getAvailableModels();
  if (!result.success) return { combos: [], groups: {} };

  const models = result.data?.data || [];
  const combos = [];
  const groups = {};

  models.forEach(m => {
    if (m.owned_by === "combo") {
      combos.push(m.id);
    } else {
      const provider = m.owned_by;
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(m.id);
    }
  });

  return { combos, groups };
}

function sortProviders(providers) {
  return providers.sort((a, b) => {
    const ia = PROVIDER_ALIAS_ORDER.indexOf(a);
    const ib = PROVIDER_ALIAS_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

async function selectModelFromList(title, currentValue = "", options = {}) {
  const { excludeCombos = false, port } = options;

  const connections = await getConnectedProviders();
  if (connections.length === 0) {
    const p = port || DEFAULT_PORT;
    console.log(`\n${COLORS.yellow}Nenhum provider conectado.${COLORS.reset}`);
    console.log(`${COLORS.dim}Acesse o dashboard para adicionar um provider:${COLORS.reset}`);
    console.log(`${COLORS.cyan}http://localhost:${p}/dashboard/providers${COLORS.reset}\n`);
    return null;
  }

  const { combos: rawCombos, groups } = await getAvailableModelsGrouped();
  const combos = excludeCombos ? [] : rawCombos;

  const connectedAliases = new Set(connections.map(c => c.provider));
  const connectedGroups = {};
  for (const [alias, models] of Object.entries(groups)) {
    if (connectedAliases.has(alias)) {
      connectedGroups[alias] = models;
    }
  }

  const sortedProviders = sortProviders(Object.keys(connectedGroups));

  const favorites = configStore.getArray("favoriteModels");
  const recentModels = configStore.getArray("recentModels");
  const allAvailable = [...combos, ...Object.values(connectedGroups).flat()];
  const validFavorites = favorites.filter(m => allAvailable.includes(m));
  const validRecent = recentModels
    .filter(m => allAvailable.includes(m) && !validFavorites.includes(m))
    .slice(0, 3);

  // --- Build provider list (level 1) ---
  const providerIds = [];
  const providerItems = [];

  if (validFavorites.length > 0) {
    providerIds.push("__favorites__");
    providerItems.push({ label: `★ Favorites  (${validFavorites.length})`, icon: "★" });
  }
  if (validRecent.length > 0) {
    providerIds.push("__recent__");
    providerItems.push({ label: `↻ Recent  (${validRecent.length})`, icon: "↻" });
  }
  if (combos.length > 0) {
    providerIds.push("__combos__");
    providerItems.push({ label: `Combos  (${combos.length})`, icon: "🔀" });
  }

  sortedProviders.forEach(alias => {
    const name = PROVIDER_ALIAS_NAMES[alias] || alias;
    const icon = PROVIDER_ICONS[alias] || "·";
    const count = connectedGroups[alias].length;
    providerIds.push(alias);
    providerItems.push({ label: `${name}  (${count})`, icon });
  });

  if (providerItems.length === 0) {
    const p = port || DEFAULT_PORT;
    console.log(`\n${COLORS.yellow}Nenhum modelo disponível.${COLORS.reset}`);
    console.log(`${COLORS.dim}Dashboard: ${COLORS.cyan}http://localhost:${p}/dashboard/providers${COLORS.reset}\n`);
    return null;
  }

  let defaultIdx = 0;
  if (currentValue) {
    const currentProvider = currentValue.split("/")[0];
    const idx = providerIds.indexOf(currentProvider);
    if (idx !== -1) defaultIdx = idx;
  }

  const subtitle = currentValue
    ? `Atual: ${currentValue} | type to filter`
    : "type to filter, ↑↓ navigate, Enter select";

  const selProvider = await selectMenu(title, providerItems, defaultIdx, subtitle);
  if (selProvider === -1) return null;

  const selectedId = providerIds[selProvider];

  if (selectedId === "__favorites__") return pickFromList("★ Favorites", validFavorites, currentValue, recentModels);
  if (selectedId === "__recent__") return pickFromList("↻ Recent", validRecent, currentValue, recentModels);
  if (selectedId === "__combos__") return pickFromList("Combos", combos, currentValue, recentModels);

  const providerModels = connectedGroups[selectedId] || [];
  const providerName = PROVIDER_ALIAS_NAMES[selectedId] || selectedId;
  return pickFromList(`${PROVIDER_ICONS[selectedId] || "·"} ${providerName}`, providerModels, currentValue, recentModels);
}

async function pickFromList(title, modelIds, currentValue, recentModels) {
  if (modelIds.length === 0) return null;
  if (modelIds.length === 1) {
    configStore.appendToArray("recentModels", modelIds[0], 10);
    return modelIds[0];
  }

  const items = modelIds.map(id => {
    const isRecent = recentModels.includes(id);
    return { label: `${id}${isRecent ? "  ↻" : ""}`, icon: "·" };
  });

  const defaultIdx = Math.max(0, modelIds.indexOf(currentValue));
  const idx = await selectMenu(title, items, defaultIdx, "type to filter, ↑↓ navigate, Enter select");
  if (idx === -1) return null;

  const selected = modelIds[idx];
  configStore.appendToArray("recentModels", selected, 10);
  return selected;
}

module.exports = {
  selectModelFromList,
  getAvailableModelsGrouped,
  PROVIDER_ALIAS_ORDER,
  PROVIDER_ALIAS_NAMES
};
