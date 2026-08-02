import { NextResponse } from "next/server";
import {
  getProvider,
  generateAuthData,
  exchangeTokens,
  requestDeviceCode,
  pollForToken,
  extractCodexAccountInfo,
  requiresDeviceCodePkce,
  requiresPollPkce,
  requiresExchangePkce
} from "@/lib/oauth/providers";
import { createProviderConnection } from "@/models";
import {
  startCodexProxy,
  stopCodexProxy,
  registerCodexSession,
  getCodexSessionStatus,
  clearCodexSession,
  startXaiProxy,
  stopXaiProxy,
  registerXaiSession,
  getXaiSessionStatus,
  clearXaiSession,
} from "@/lib/oauth/utils/server.js";

/** Save an OAuth connection to the database (deduplicates the 3 call sites) */
async function saveOauthConnection(provider, tokenData) {
  return createProviderConnection({
    provider,
    authType: "oauth",
    ...tokenData,
    expiresAt: tokenData.expiresIn
      ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()
      : null,
    testStatus: "active",
  });
}

/** Slim connection envelope used in all success responses */
function connectionEnvelope(connection) {
  return {
    id: connection.id,
    provider: connection.provider,
    ...(connection.email != null && { email: connection.email }),
    ...(connection.displayName && { displayName: connection.displayName }),
  };
}

/** Sanitize error messages to prevent leaking sensitive tokens */
function sanitizeOAuthError(error) {
  const errorMessage = error.message.replace(/[a-zA-Z0-9]{32,}/g, "***TOKEN***");
  return NextResponse.json({
    error: "OAuth error",
    message: errorMessage
  }, { status: 500 });
}

async function completeXaiManualCode(code, state) {
  const session = state ? getXaiSessionStatus(state) : null;
  if (!session) {
    throw new Error("xAI OAuth session not found; restart the login flow and paste the code again");
  }
  if (!code) throw new Error("Missing xAI authorization code");

  try {
    const tokenData = await exchangeTokens(
      "xai",
      code,
      session.redirectUri,
      session.codeVerifier,
      state
    );
    const connection = await saveOauthConnection("xai", tokenData);
    clearXaiSession(state);
    stopXaiProxy();
    return {
      id: connection.id,
      provider: connection.provider,
      email: connection.email,
      displayName: connection.displayName,
    };
  } catch (err) {
    clearXaiSession(state);
    stopXaiProxy();
    throw err;
  }
}

// GET /api/oauth/[provider]/authorize - Generate auth URL
// GET /api/oauth/[provider]/device-code - Request device code (for device_code flow)
export async function GET(request, { params }) {
  try {
    const { provider, action } = await params;
    const { searchParams } = new URL(request.url);

    if (action === "authorize") {
      const redirectUri = searchParams.get("redirect_uri") || "http://localhost:8080/callback";
      // Collect provider-specific meta params (e.g. gitlab passes baseUrl, clientId, clientSecret)
      const reservedParams = new Set(["redirect_uri"]);
      const meta = {};
      searchParams.forEach((value, key) => { if (!reservedParams.has(key)) meta[key] = value; });
      const authData = await generateAuthData(provider, redirectUri, Object.keys(meta).length ? meta : undefined);
      return NextResponse.json(authData);
    }

    if (action === "start-proxy") {
      if (!["codex", "xai"].includes(provider)) {
        return NextResponse.json({ error: "Proxy only supported for codex/xai" }, { status: 400 });
      }
      const appPort = searchParams.get("app_port");
      if (!appPort) {
        return NextResponse.json({ error: "Missing app_port" }, { status: 400 });
      }
      const state = searchParams.get("state");
      const codeVerifier = searchParams.get("code_verifier");
      const redirectUri = searchParams.get("redirect_uri");
      const result = provider === "xai"
        ? await startXaiProxy(Number(appPort))
        : await startCodexProxy(Number(appPort));
      let serverSide = false;
      if (result.success && state && codeVerifier && redirectUri) {
        serverSide = provider === "xai"
          ? registerXaiSession({ state, codeVerifier, redirectUri })
          : registerCodexSession({ state, codeVerifier, redirectUri });
      }
      return NextResponse.json({ ...result, serverSide });
    }

    if (action === "poll-status") {
      if (!["codex", "xai"].includes(provider)) {
        return NextResponse.json({ error: "Poll only supported for codex/xai" }, { status: 400 });
      }
      const state = searchParams.get("state");
      if (!state) {
        return NextResponse.json({ error: "Missing state" }, { status: 400 });
      }
      const session = provider === "xai" ? getXaiSessionStatus(state) : getCodexSessionStatus(state);
      if (!session) return NextResponse.json({ status: "unknown" });
      if (session.status === "done" || session.status === "error") {
        const payload = { ...session };
        if (provider === "xai") clearXaiSession(state);
        else clearCodexSession(state);
        return NextResponse.json(payload);
      }
      return NextResponse.json({ status: session.status });
    }

    if (action === "stop-proxy") {
      if (!["codex", "xai"].includes(provider)) {
        return NextResponse.json({ error: "Proxy only supported for codex/xai" }, { status: 400 });
      }
      if (provider === "xai") stopXaiProxy();
      else stopCodexProxy();
      return NextResponse.json({ success: true });
    }

    if (action === "device-code") {
      const providerData = getProvider(provider);
      if (providerData.flowType !== "device_code") {
        return NextResponse.json({ error: "Provider does not support device code flow" }, { status: 400 });
      }

      const authData = await generateAuthData(provider, null);
      const startUrl = searchParams.get("start_url");
      const region = searchParams.get("region");
      const authMethod = searchParams.get("auth_method");
      const deviceOptions = provider === "kiro"
        ? {
            ...(startUrl ? { startUrl } : {}),
            ...(region ? { region } : {}),
            ...(authMethod ? { authMethod } : {}),
          }
        : undefined;

      // Provider config declares whether PKCE challenge is required
      let deviceData;
      if (!requiresDeviceCodePkce(provider)) {
        deviceData = await requestDeviceCode(provider, undefined, deviceOptions);
      } else {
        deviceData = await requestDeviceCode(provider, authData.codeChallenge, deviceOptions);
      }

      return NextResponse.json({
        ...deviceData,
        // Prefer the verifier the provider's requestDeviceCode generated for
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return sanitizeOAuthError(error);
  }
}

export async function POST(request, { params }) {
  try {
    const { provider, action } = await params;
    const body = await request.json();

    if (action === "exchange") {
      const { code, redirectUri, codeVerifier, state, meta } = body;

      // Detect if "code" is actually a raw JWT access token (starts with eyJ)
      if (code && code.startsWith("eyJ") && code.includes(".")) {
        const info = extractCodexAccountInfo(code);

        // Also decode JWT directly for ChatGPT website tokens which use
        // top-level account_id/plan_type instead of nested openai auth claims
        let directPayload = {};
        try {
          const b64 = code.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
          const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
          directPayload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
        } catch {}

        const accountId = info.chatgptAccountId || directPayload.account_id;
        const planType = info.chatgptPlanType || directPayload.plan_type;
        const email = info.email || directPayload.email;

        const providerSpecificData = { authMethod: "access_token" };
        if (accountId) providerSpecificData.chatgptAccountId = accountId;
        if (planType) providerSpecificData.chatgptPlanType = planType;

        const connection = await createProviderConnection({
          provider,
          authType: "access_token",
          accessToken: code,
          email: email || null,
          providerSpecificData,
          testStatus: "active",
        });

        return NextResponse.json({
          success: true,
          connection: connectionEnvelope(connection)
        });
      }

      // Some providers skip PKCE at exchange (cline, clinepass, kimchi)
      if (!code || !redirectUri || (!codeVerifier && requiresExchangePkce(provider))) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      // Exchange code for tokens (meta carries provider-specific params, e.g. gitlab clientId/baseUrl)
      const tokenData = await exchangeTokens(provider, code, redirectUri, codeVerifier, state, meta);

      // Save to database
      const connection = await saveOauthConnection(provider, tokenData);

      return NextResponse.json({
        success: true,
        connection: connectionEnvelope(connection)
      });
    }

    if (action === "poll") {
      const { deviceCode, codeVerifier, extraData } = body;

      if (!deviceCode) {
        return NextResponse.json({ error: "Missing device code" }, { status: 400 });
      }

      // Provider config declares whether PKCE challenge is required at poll time
      let result;
      if (!requiresPollPkce(provider)) {
        // kimi/kiro pass extraData for special fields (deviceId, clientId, etc.)
        result = await pollForToken(provider, deviceCode, null, extraData);
      } else {
        // Qwen and other PKCE providers
        if (!codeVerifier) {
          return NextResponse.json({ error: "Missing code verifier" }, { status: 400 });
        }
        result = await pollForToken(provider, deviceCode, codeVerifier);
      }

      if (result.success) {
        // Save to database (legacy kimi-coding OAuth → dual-auth kimi)
        const providerId = provider === "kimi-coding" ? "kimi" : provider;
        const connection = await saveOauthConnection(providerId, result.tokens);

        return NextResponse.json({
          success: true,
          connection: connectionEnvelope(connection)
        });
      }

      // Still pending or error - don't create connection for pending states
      const isPending = result.pending || result.error === "authorization_pending" || result.error === "slow_down";

      return NextResponse.json({
        success: false,
        error: result.error,
        errorDescription: result.errorDescription,
        pending: isPending,
      });
    }

    if (action === "manual-code") {
      if (provider !== "xai") {
        return NextResponse.json({ error: "Manual code only supported for xai" }, { status: 400 });
      }
      const { code, state } = body;
      const connection = await completeXaiManualCode(String(code || "").trim(), String(state || "").trim());
      return NextResponse.json({ success: true, connection });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return sanitizeOAuthError(error);
  }
}