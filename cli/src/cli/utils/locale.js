const configStore = require("./configStore");

/**
 * Detect OS language using system env vars (LANG, LC_ALL, etc.)
 */
function detectSystemLanguage() {
  const envLang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANGUAGE || "";
  if (envLang.toLowerCase().includes("pt")) return "pt-BR";
  return "en-US";
}

/**
 * Get active language: explicit user config or OS auto-detection
 */
function getActiveLanguage() {
  const userLang = configStore.get("language", "auto");
  if (userLang === "auto" || !userLang) {
    return detectSystemLanguage();
  }
  return userLang; // "pt-BR" or "en-US"
}

function setLanguage(lang) {
  configStore.set("language", lang); // "auto", "pt-BR", "en-US"
}

module.exports = {
  detectSystemLanguage,
  getActiveLanguage,
  setLanguage
};
