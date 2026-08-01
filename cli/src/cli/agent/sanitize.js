/**
 * sanitize.js — Sanitizador de segurança para prompts e outputs.
 *
 * Redacts API keys, tokens, secrets, e private keys do texto
 * antes de injetar na conversa com a IA.
 */

/**
 * Remove chaves, tokens e segredos sensíveis do texto.
 * @param {string} text - Texto a ser sanitizado
 * @returns {string} Texto com secrets substituídos por [REDACTED_*]
 */
function sanitizePromptContext(text) {
  if (typeof text !== "string") return text;
  return text
    // Cloud provider keys
    .replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_OPENAI_KEY]")
    .replace(/\b(sk-ant-api[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_ANTHROPIC_KEY]")
    .replace(/\b(AKIA[0-9A-Z]{16})\b/g, "[REDACTED_AWS_KEY]")
    .replace(/\b(AIza[0-9A-Za-z_-]{35})\b/g, "[REDACTED_GCP_KEY]")
    // Git/CI tokens
    .replace(/\b(ghp_[a-zA-Z0-9]{30,})\b/g, "[REDACTED_GITHUB_KEY]")
    .replace(/\b(gho_[a-zA-Z0-9]{30,})\b/g, "[REDACTED_GITHUB_OAUTH]")
    .replace(/\b(ghs_[a-zA-Z0-9]{30,})\b/g, "[REDACTED_GITHUB_APP]")
    .replace(/\b(glpat-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_GITLAB_TOKEN]")
    .replace(/\b(glrt-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_GITLAB_RUNNER]")
    // Chat/messaging tokens
    .replace(/\b(xoxb-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_SLACK_BOT]")
    .replace(/\b(xoxp-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_SLACK_USER]")
    .replace(/\b(bot[0-9]+:[a-zA-Z0-9_-]{30,})\b/g, "[REDACTED_TELEGRAM_BOT]")
    // Payment
    .replace(/\b(sk_live_[a-zA-Z0-9]{20,})\b/g, "[REDACTED_STRIPE_KEY]")
    .replace(/\b(rk_live_[a-zA-Z0-9]{20,})\b/g, "[REDACTED_STRIPE_KEY]")
    // JWT & auth
    .replace(/\b(eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED_JWT_TOKEN]")
    .replace(/(Bearer\s+)[a-zA-Z0-9._-]{20,}/gi, "$1[REDACTED_BEARER_TOKEN]")
    // Env vars with secrets
    .replace(/(DATABASE_URL|MYSQL_PASSWORD|POSTGRES_PASSWORD|REDIS_PASSWORD|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_TOKEN|AUTH_TOKEN|DISCORD_TOKEN)=["']?[^"'\s\n]{6,}["']?/gi, "$1=[REDACTED_SECRET]")
    // Private keys
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
}

module.exports = { sanitizePromptContext };
