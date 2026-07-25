import { handleChat } from "@/sse/handlers/chat.js";
import { checkRateLimit } from "@/lib/network/rateLimiter";
import { initTranslators } from "open-sse/translator/index.js";

let initialized = false;

/**
 * Initialize translators once
 */
async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}

/**
 * POST /v1/messages - Claude format (auto convert via handleChat)
 */
export async function POST(request) {
  // Apply Rate Limiting & Exponential Backoff
  const authHeader = request.headers.get("authorization") || "";
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  const isInternalCli = request.headers.get("x-hiperrouter-cli") === "true";
  const clientKey = authHeader ? authHeader : ip;
  
  const rl = checkRateLimit(clientKey, isInternalCli);
  if (!rl.allowed) {
    return new Response(JSON.stringify({
      error: {
        message: rl.message,
        type: "rate_limit_exceeded",
        code: 429
      }
    }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": rl.retryAfter.toString()
      }
    });
  }

  await ensureInitialized();
  return await handleChat(request);
}

