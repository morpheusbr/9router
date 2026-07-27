/**
 * Simple i18n — bilingual PT-BR / EN messages.
 * Falls back to EN if key missing in selected locale.
 */
const configStore = require("./configStore");

const messages = {
  "pt-BR": {
    "server.starting": "🚀 Iniciando servidor Web HiperRouter (porta %s)...",
    "server.already_running": "ℹ Servidor já ativo na porta %s.",
    "server.failed": "❌ Falha ao iniciar o servidor na porta %s.",
    "server.crashed": "❌ Servidor saiu com código %s.",
    "server.crashed_fast": "   Servidor crashou imediatamente — tente com --log.",
    "update.available": "⬆ Atualização v%s → v%s disponível! Rode: npm i -g hiperrouter@latest",
    "lock.held": "❌ HiperRouter já está rodando (PID %s).",
    "lock.delete_hint": "   Pare-o primeiro, ou delete: %s",
    "port.invalid": "❌ Porta inválida: \"%s\". Deve ser um número.",
    "port.range": "❌ Porta %s fora do range. Deve ser %s-%s.",
    "host.invalid": "❌ Host inválido: \"%s\".",
    "exiting": "\nSaindo...",
    "rate_limit": "⚠️  Rate limit (429) no modelo '%s' — aguardando %ss...",
    "rate_limit_max": "❌ Rate limit atingido %sx consecutivas. Troque de modelo com /model.",
    "model.select": "Selecione o Modelo",
    "model.none_available": "Nenhum modelo disponível dos providers conectados.",
    "provider.none": "Nenhum provider conectado.",
    "provider.add_hint": "Acesse o dashboard para adicionar um provider:",
    "chat.session_restored": "[Sessão anterior restaurada. Use /clear para reiniciar]",
    "chat.history_cleared": "Histórico do chat limpo.",
    "chat.no_history": "Nenhuma mensagem no histórico.",
    "chat.no_ai_response": "Nenhuma resposta da IA no histórico.",
    "chat.copied": "✅ Copiado para a área de transferência!",
    "chat.copy_failed": "Falha ao copiar para a área de transferência.",
    "chat.saved": "✅ Conversa salva em '%s'",
    "chat.empty": "Nenhuma mensagem na sessão para salvar.",
    "onboarding.welcome": "🚀 Bem-vindo ao %s!",
    "onboarding.setup": "Vamos configurar seu ambiente.",
    "tray.unavailable": "tray indisponível: sem DISPLAY (Linux headless)",
    "tray.running": "Router rodando na system tray. Feche o terminal se quiser.",
    "tray.hint": "Clique direito no ícone da tray para abrir dashboard ou sair.",
  },
  "en": {
    "server.starting": "🚀 Starting HiperRouter Web server (port %s)...",
    "server.already_running": "ℹ Server already running on port %s.",
    "server.failed": "❌ Failed to start server on port %s.",
    "server.crashed": "❌ Server exited with code %s.",
    "server.crashed_fast": "   Server crashed immediately — try with --log.",
    "update.available": "⬆ Update v%s → v%s available! Run: npm i -g hiperrouter@latest",
    "lock.held": "❌ HiperRouter is already running (PID %s).",
    "lock.delete_hint": "   Stop it first, or delete: %s",
    "port.invalid": "❌ Invalid port: \"%s\". Must be a number.",
    "port.range": "❌ Port %s out of range. Must be %s-%s.",
    "host.invalid": "❌ Invalid host: \"%s\".",
    "exiting": "\nExiting...",
    "rate_limit": "⚠️  Rate limit (429) on model '%s' — waiting %ss...",
    "rate_limit_max": "❌ Rate limit hit %s times in a row. Switch model with /model.",
    "model.select": "Select Model",
    "model.none_available": "No models available from connected providers.",
    "provider.none": "No providers connected.",
    "provider.add_hint": "Visit the dashboard to add a provider:",
    "chat.session_restored": "[Previous session restored. Use /clear to reset]",
    "chat.history_cleared": "Chat history cleared.",
    "chat.no_history": "No messages in history.",
    "chat.no_ai_response": "No AI response in history.",
    "chat.copied": "✅ Copied to clipboard!",
    "chat.copy_failed": "Failed to copy to clipboard.",
    "chat.saved": "✅ Chat saved to '%s'",
    "chat.empty": "No messages in session to save.",
    "onboarding.welcome": "🚀 Welcome to %s!",
    "onboarding.setup": "Let's set up your environment.",
    "tray.unavailable": "tray unavailable: no DISPLAY (headless Linux)",
    "tray.running": "Router is running in system tray. Close this terminal if you want.",
    "tray.hint": "Right-click tray icon to open dashboard or quit.",
  }
};

function getLocale() {
  return configStore.get("locale", "pt-BR");
}

/**
 * Get localized message with sprintf-style %s substitution.
 * @param {string} key - Message key
 * @param  {...any} args - Substitution args
 * @returns {string}
 */
function t(key, ...args) {
  const locale = getLocale();
  let msg = messages[locale]?.[key] || messages["en"]?.[key] || key;
  for (const arg of args) {
    msg = msg.replace("%s", String(arg));
  }
  return msg;
}

module.exports = { t, getLocale, messages };
