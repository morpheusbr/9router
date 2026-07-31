const api = require("../api/client");
const { pause } = require("../utils/input");
const { DEFAULT_PORT } = require("../constants");

async function run(args) {
  console.log(`\n⚡ HiperRouter Benchmark & Latency Test`);
  console.log(`======================================\n`);

  console.log(`⏳ Testando modelos e medindo latência (Time-To-First-Token)...\n`);

  const modelsToTest = ["gpt-4o", "claude-3-5-sonnet", "gemini-1-5-pro", "deepseek-chat"];
  const testPrompt = "Responda 'OK' em 1 palavra.";

  console.log(` MODELO                  | LATÊNCIA (TTFT) | STATUS`);
  console.log(`-------------------------+-----------------+---------`);

  for (const m of modelsToTest) {
    const startTime = Date.now();
    try {
      const res = await fetch(`http://localhost:${DEFAULT_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: m,
          messages: [{ role: "user", content: testPrompt }],
          max_tokens: 5
        })
      });
      const latency = Date.now() - startTime;
      if (res.ok) {
        console.log(` ${m.padEnd(23)} | ${String(latency + "ms").padEnd(15)} | 🟢 OK`);
      } else {
        console.log(` ${m.padEnd(23)} | ${String(latency + "ms").padEnd(15)} | 🔴 HTTP ${res.status}`);
      }
    } catch (err) {
      const latency = Date.now() - startTime;
      console.log(` ${m.padEnd(23)} | ${String(latency + "ms").padEnd(15)} | ❌ Offline / Erro`);
    }
  }

  console.log(`\n======================================\n`);
  return 0;
}

module.exports = { run };
