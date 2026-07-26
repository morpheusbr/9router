const api = require("../api/client");
const { selectMenu } = require("./input");

// Provider alias order: OAuth first, then API Key (matches ModelSelectModal)
const PROVIDER_ALIAS_ORDER = [
  "cc", "ag", "cx", "if", "qw", "gc", "gh", "kr",
  "openrouter", "glm", "kimi", "minimax", "openai", "anthropic", "gemini"
];

// Alias to display name mapping
const PROVIDER_ALIAS_NAMES = {
  cc: "Claude Code",
  ag: "Antigravity", 
  cx: "OpenAI Codex",
  if: "iFlow AI",
  qw: "Qwen Code",
  gc: "Gemini CLI",
  gh: "GitHub Copilot",
  kr: "Kiro AI",
  openrouter: "OpenRouter",
  glm: "GLM Coding",
  kimi: "Kimi Coding",
  minimax: "Minimax Coding",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini"
};

/**
 * Get all available models grouped by provider + combos
 * @returns {Promise<{combos: Array, groups: Object}>}
 */
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
      if (!groups[provider]) {
        groups[provider] = [];
      }
      groups[provider].push(m.id);
    }
  });
  
  return { combos, groups };
}

/**
 * Display model list with arrow-key navigation and prompt for selection.
 * @param {string} title - Title to display
 * @param {string} currentValue - Current selected value (optional)
 * @param {Object} options - { excludeCombos?: boolean }
 * @returns {Promise<string|null>} Selected model ID or null if cancelled
 */
async function selectModelFromList(title, currentValue = "", options = {}) {
  const { excludeCombos = false } = options;
  const { combos: rawCombos, groups } = await getAvailableModelsGrouped();
  const combos = excludeCombos ? [] : rawCombos;

  // Flat list: model IDs in order (parallel to menuItems)
  const allModelIds = [];
  const menuItems    = [];

  // Combos primeiro
  if (combos.length > 0) {
    combos.forEach(combo => {
      allModelIds.push(combo);
      menuItems.push({ label: `${combo}  (Combo)`, icon: "🔀" });
    });
  }

  // Providers em ordem canônica
  const sortedProviders = Object.keys(groups).sort((a, b) => {
    const ia = PROVIDER_ALIAS_ORDER.indexOf(a);
    const ib = PROVIDER_ALIAS_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  sortedProviders.forEach(provider => {
    const providerName = PROVIDER_ALIAS_NAMES[provider] || provider;
    groups[provider].forEach(model => {
      allModelIds.push(model);
      menuItems.push({ label: `${model}  (${providerName})`, icon: "·" });
    });
  });

  if (menuItems.length === 0) return null;

  // Pré-selecionar o modelo atual, se existir na lista
  const defaultIndex = Math.max(0, allModelIds.indexOf(currentValue));
  const subtitle = currentValue ? `Atual: ${currentValue}` : "Use ↑↓ para navegar, Enter para confirmar";

  const selectedIdx = await selectMenu(title, menuItems, defaultIndex, subtitle);
  if (selectedIdx === -1) return null;
  return allModelIds[selectedIdx];
}

module.exports = {
  selectModelFromList,
  getAvailableModelsGrouped,
  PROVIDER_ALIAS_ORDER,
  PROVIDER_ALIAS_NAMES
};

