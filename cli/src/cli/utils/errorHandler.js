const { COLORS } = require("./input");
const fs = require("fs");
const path = require("path");

/**
 * Error categories for structured error handling.
 */
const ERROR_CATEGORY = {
  NETWORK: "NETWORK",
  API: "API",
  FILESYSTEM: "FILESYSTEM",
  AUTH: "AUTH",
  VALIDATION: "VALIDATION",
  UNKNOWN: "UNKNOWN",
};

/**
 * Classify an error by its type/category.
 * @param {Error|string} err
 * @returns {string}
 */
function classifyError(err) {
  const msg = (err?.message || err || "").toLowerCase();
  if (msg.includes("econnrefused") || msg.includes("timeout") || msg.includes("enotfound") || msg.includes("fetch failed") || msg.includes("socket hang up")) return ERROR_CATEGORY.NETWORK;
  if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")) return ERROR_CATEGORY.AUTH;
  if (msg.includes("enoent") || msg.includes("eacces") || msg.includes("eperm") || msg.includes("file") || msg.includes("directory")) return ERROR_CATEGORY.FILESYSTEM;
  if (msg.includes("400") || msg.includes("422") || msg.includes("validation") || msg.includes("invalid")) return ERROR_CATEGORY.VALIDATION;
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("api error")) return ERROR_CATEGORY.API;
  return ERROR_CATEGORY.UNKNOWN;
}

/**
 * Get a user-friendly error message with recovery suggestion.
 * @param {Error|string} err
 * @returns {{ message: string, suggestion: string, category: string }}
 */
function parseError(err) {
  const msg = err?.message || String(err);
  const category = classifyError(err);

  const suggestions = {
    [ERROR_CATEGORY.NETWORK]: "Verifique sua conexão e se o servidor está rodando (hiperrouter status).",
    [ERROR_CATEGORY.AUTH]: "Verifique suas credenciais. Use /key para gerenciar API keys.",
    [ERROR_CATEGORY.FILESYSTEM]: "Verifique permissões e se o arquivo/diretório existe.",
    [ERROR_CATEGORY.VALIDATION]: "Dados inválidos. Verifique os parâmetros fornecidos.",
    [ERROR_CATEGORY.API]: "Erro no servidor. Tente novamente ou troque de modelo com /model.",
    [ERROR_CATEGORY.UNKNOWN]: "Erro inesperado. Use /debug para mais detalhes.",
  };

  return {
    message: msg.substring(0, 500),
    suggestion: suggestions[category],
    category,
  };
}

/**
 * Standardized error display with category icon and recovery suggestion.
 * @param {Error|string} err
 * @param {object} [opts]
 * @param {string} [opts.context] - Context label (ex: "Patch", "API", "File")
 * @param {boolean} [opts.silent] - If true, only log when DEBUG is set
 * @param {boolean} [opts.showSuggestion] - Show recovery suggestion (default: true)
 */
function handleError(err, opts = {}) {
  const { context = "", silent = false, showSuggestion = true } = opts;

  if (silent && !process.env.DEBUG) return;

  const { message, suggestion, category } = parseError(err);
  const icons = {
    [ERROR_CATEGORY.NETWORK]: "🌐",
    [ERROR_CATEGORY.AUTH]: "🔐",
    [ERROR_CATEGORY.FILESYSTEM]: "📁",
    [ERROR_CATEGORY.VALIDATION]: "⚠️",
    [ERROR_CATEGORY.API]: "🔌",
    [ERROR_CATEGORY.UNKNOWN]: "❌",
  };

  const icon = icons[category] || "❌";
  const ctxLabel = context ? `[${context}] ` : "";

  console.log(`\n${COLORS.red}${icon} ${ctxLabel}${message}${COLORS.reset}`);
  if (showSuggestion) {
    console.log(`${COLORS.dim}   💡 ${suggestion}${COLORS.reset}`);
  }
}

/**
 * Safe catch handler that logs errors properly instead of swallowing them.
 * Use in place of empty catch {} blocks.
 * @param {string} context - Where the error occurred
 * @param {boolean} [silent=false] - Only log in DEBUG mode
 * @returns {function} Catch handler function
 */
function safeCatch(context, silent = false) {
  return (err) => {
    if (silent && !process.env.DEBUG) return;
    if (err) handleError(err, { context, silent, showSuggestion: false });
  };
}

/**
 * Write error to audit log file.
 * @param {Error} err
 * @param {string} context
 */
function auditError(err, context) {
  try {
    const { getCliDataDir } = require("../constants");
    const auditDir = getCliDataDir();
    if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
    const logPath = path.join(auditDir, "audit.log");
    const entry = {
      timestamp: new Date().toISOString(),
      action: "ERROR",
      context,
      message: err?.message || String(err),
      stack: err?.stack?.substring(0, 1000),
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch {}
}

module.exports = {
  ERROR_CATEGORY,
  classifyError,
  parseError,
  handleError,
  safeCatch,
  auditError,
};
