const https = require("https");
const { getRecoveryProvider } = require("./recoveryDb");

function makeDirectRequest(providerConfig, messages) {
  return new Promise((resolve, reject) => {
    let hostname, path, headers, bodyObj;

    if (providerConfig.provider === "anthropic") {
      hostname = "api.anthropic.com";
      path = "/v1/messages";
      headers = {
        "x-api-key": providerConfig.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      };

      const systemMsg = messages.find(m => m.role === "system")?.content || "";
      const otherMsgs = messages.filter(m => m.role !== "system");

      bodyObj = {
        model: "claude-3-5-sonnet-latest",
        max_tokens: 4000,
        system: systemMsg,
        messages: otherMsgs
      };
    } else {
      // OpenAI-compatible (openai, groq, etc)
      const url = new URL(providerConfig.baseUrl);
      hostname = url.hostname;
      path = url.pathname + "/chat/completions";
      headers = {
        "Authorization": `Bearer ${providerConfig.apiKey}`,
        "Content-Type": "application/json"
      };
      bodyObj = {
        model: providerConfig.provider === "groq" ? "llama-3.1-70b-versatile" : "gpt-4o",
        messages: messages,
        temperature: 0.1
      };
    }

    const req = https.request({
      hostname,
      path,
      method: "POST",
      headers
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));

          let content = "";
          if (providerConfig.provider === "anthropic") {
            content = parsed.content?.[0]?.text || "";
          } else {
            content = parsed.choices?.[0]?.message?.content || "";
          }
          resolve(content);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(JSON.stringify(bodyObj));
    req.end();
  });
}

async function askRecoveryLLM(messages) {
  const provider = getRecoveryProvider();
  if (!provider) {
    throw new Error("No OpenAI/Anthropic keys found in SQLite DB. Cannot self-heal without external LLM access.");
  }
  return await makeDirectRequest(provider, messages);
}

module.exports = { askRecoveryLLM };