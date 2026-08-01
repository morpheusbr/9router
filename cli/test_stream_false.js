const api = require("/home/www/HiperRouter/cli/src/cli/api/client");
async function test() {
  const keysResult = await api.getApiKeys();
  const apiKey = keysResult.success ? keysResult.data.keys[0].key : "no-key";
  const response = await fetch(`http://localhost:20128/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "x-hiperrouter-cli": "true"
    },
    body: JSON.stringify({
      model: "meu-combo",
      messages: [{ role: "user", content: "oi" }],
      stream: false
    })
  });
  console.log("STATUS:", response.status);
  const data = await response.json();
  console.log("DATA:", data);
}
test().catch(console.error);
