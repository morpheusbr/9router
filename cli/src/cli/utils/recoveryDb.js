const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const cwdDir = path.join(process.cwd(), '.HiperRouter');
  if (fs.existsSync(cwdDir)) return cwdDir;
  return path.resolve(__dirname, "../../../..", ".HiperRouter");
}

function loadDbSecret() {
  if (process.env.DB_SECRET) return process.env.DB_SECRET;
  const file = path.join(getDataDir(), "db-secret");
  try { return fs.readFileSync(file, "utf8").trim(); } catch { return ""; }
}

function decryptSecret(text, secretHex) {
  if (!text || typeof text !== 'string') return text;
  if (!text.startsWith("enc:")) return text;

  try {
    const ENCRYPTION_KEY = Buffer.from(secretHex.slice(0, 64).padEnd(64, '0'), 'hex');
    const ALGORITHM = 'aes-256-gcm';
    const parts = text.split(':');
    if (parts.length !== 4) return text;

    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encrypted = Buffer.from(parts[3], 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return text;
  }
}

function getRecoveryProvider() {
  const secretHex = loadDbSecret();
  if (!secretHex) return null;

  try {
    // Try to load sqlite dynamically, fallback if not available
    const Database = require("better-sqlite3");
    const dbPath = path.join(getDataDir(), "db.sqlite");
    if (!fs.existsSync(dbPath)) return null;

    const db = new Database(dbPath, { readonly: true });

    // Get all connections
    const rows = db.prepare(`SELECT * FROM provider_connections WHERE is_active = 1`).all();
    db.close();

    for (const row of rows) {
      if (!row.data) continue;
      let dataStr = row.data;
      if (dataStr.startsWith("enc:")) dataStr = decryptSecret(dataStr, secretHex);

      try {
        const parsed = JSON.parse(dataStr);
        // Look for OpenAI or Anthropic directly
        if (parsed.provider === "openai" && parsed.apiKey) {
          return { provider: "openai", apiKey: parsed.apiKey, baseUrl: parsed.baseUrl || "https://api.openai.com/v1" };
        }
        if (parsed.provider === "anthropic" && parsed.apiKey) {
          return { provider: "anthropic", apiKey: parsed.apiKey };
        }
        if (parsed.provider === "groq" && parsed.apiKey) {
          return { provider: "groq", apiKey: parsed.apiKey, baseUrl: "https://api.groq.com/openai/v1" };
        }
      } catch (e) {}
    }
  } catch (err) {
    // Cannot load better-sqlite3 or db error
    console.error("Recovery DB Error:", err.message);
  }
  return null;
}

module.exports = { getRecoveryProvider };
