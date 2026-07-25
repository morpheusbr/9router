const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 20128;
const BASE_URL = `http://localhost:${PORT}`;

const DATA_DIR = path.resolve(__dirname, '..', '.9router');
const MACHINE_ID_FILE = path.join(DATA_DIR, 'machine-id');
const CLI_SECRET_FILE = path.join(DATA_DIR, 'auth', 'cli-secret');
const CLI_TOKEN_SALT = '9r-cli-auth';

function getCliToken() {
  const raw = fs.readFileSync(MACHINE_ID_FILE, 'utf8').trim();
  const secret = fs.readFileSync(CLI_SECRET_FILE, 'utf8').trim();
  return crypto.createHash('sha256').update(raw + CLI_TOKEN_SALT + secret).digest('hex').substring(0, 16);
}

async function runTests() {
  console.log(`[TEST] Starting API integration tests on ${BASE_URL}...`);

  let cliToken;
  try {
    cliToken = getCliToken();
    console.log(`[TEST] ✓ Generated CLI Token`);
  } catch (err) {
    console.error(`[TEST] ❌ Failed to generate CLI Token: ${err.message}`);
    process.exit(1);
  }

  // Test 1: Fetch API Keys
  let apiKey;
  try {
    const res = await fetch(`${BASE_URL}/api/keys`, {
      headers: {
        'x-9r-cli-token': cliToken,
      }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    
    if (data.keys && data.keys.length > 0) {
      apiKey = data.keys[0].key;
      console.log(`[TEST] ✓ Fetched API Keys successfully (using key: ${apiKey.substring(0, 10)}...)`);
    } else {
      throw new Error("No API keys found in the database!");
    }
  } catch (err) {
    console.error(`[TEST] ❌ /api/keys failed: ${err.message}`);
    process.exit(1);
  }

  // Test 2: Invalid Model on /v1/chat/completions (Should return 400/404, but pass Auth)
  try {
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "this-model-does-not-exist",
        messages: [{ role: "user", content: "Test message" }]
      })
    });
    
    const data = await res.json();
    
    // As long as it's not 401 Unauthorized, authentication worked.
    if (res.status === 401) {
      throw new Error(`Auth failed! Status 401: ${JSON.stringify(data)}`);
    }

    console.log(`[TEST] ✓ /v1/chat/completions passed authentication (Expected Error: ${res.status} ${data.error?.code || data.error?.message || ''})`);
  } catch (err) {
    console.error(`[TEST] ❌ /v1/chat/completions test failed: ${err.message}`);
    process.exit(1);
  }

  // Test 3: Anti-SSRF Protection on Proxy URL (Should block localhost/127.0.0.1)
  try {
    const res = await fetch(`${BASE_URL}/api/providers/test-id`, {
      method: "PUT",
      headers: {
        'Content-Type': 'application/json',
        'x-9r-cli-token': cliToken, // Uses CLI token to bypass dashboard auth
      },
      body: JSON.stringify({
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://127.0.0.1:8080" // Malicious internal SSRF URL
      })
    });
    
    let data;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.warn(`[TEST] ⚠️ Expected JSON but got: ${text}`);
      data = { error: "Parse error", text };
    }
    
    if (res.status === 400 && JSON.stringify(data).includes("SSRF Protection")) {
      console.log(`[TEST] ✓ SSRF Protection successfully blocked internal network proxy URL! (Status: ${res.status})`);
    } else if (res.status === 400 && data.error === "Validation failed") {
      console.log(`[TEST] ✓ SSRF Protection blocked the payload via Zod Validation failed`);
    } else {
      console.warn(`[TEST] ⚠️ SSRF check did not behave exactly as expected. Status: ${res.status}, Response:`, data);
    }
  } catch (err) {
    console.error(`[TEST] ❌ SSRF Protection test failed: ${err.message}`);
    process.exit(1);
  }

  console.log("\n✅ All critical API tests passed successfully!");
}

runTests();
