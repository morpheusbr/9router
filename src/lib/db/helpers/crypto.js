import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "@/lib/dataDir.js";

function loadDbSecret() {
  // Use environment variable instead of writing to disk
  if (process.env.DB_SECRET) return process.env.DB_SECRET;
  // Fallback to default location for backward compatibility
  const file = path.join(DATA_DIR, "db-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    // Create file if it doesn't exist but don't write the secret to disk
    // In production, DB_SECRET should be set via environment
    if (process.env.NODE_ENV === "production" && !process.env.DB_SECRET) {
      console.warn("[crypto] DB_SECRET environment variable not set - using insecure fallback");
    }
    return "fallback_secret_for_development_only";
  }
}

const secretHex = loadDbSecret();
const ENCRYPTION_KEY = Buffer.from(secretHex.slice(0, 64).padEnd(64, '0'), 'hex');
const ALGORITHM = 'aes-256-gcm';

export function encryptSecret(text) {
  if (!text || typeof text !== 'string') return text;
  if (text.startsWith("enc:")) return text; // already encrypted

  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error("Failed to encrypt secret:", err.message);
    return text; // fallback to plain if crypto fails
  }
}

export function decryptSecret(text) {
  if (!text || typeof text !== 'string') return text;
  if (!text.startsWith("enc:")) return text; // return plain text directly (fallback for existing DBs)

  try {
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
    console.error("Failed to decrypt secret:", err.message);
    return text; // fallback
  }
}