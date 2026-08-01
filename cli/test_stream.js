const api = require("/home/www/HiperRouter/cli/src/cli/api/client");
async function test() {
  const port = 20128;
  const keysResult = await api.getApiKeys();
  const apiKey = keysResult.success ? keysResult.data.keys[0].key : "no-key";
  const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "x-hiperrouter-cli": "true"
    },
    body: JSON.stringify({
      model: "meu-combo",
      messages: [{ role: "user", content: "oi" }],
      stream: true
    })
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log("CHUNK:", decoder.decode(value));
  }
}
test().catch(console.error);
