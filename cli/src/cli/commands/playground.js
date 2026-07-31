const { pause } = require("../utils/input");
const { DEFAULT_PORT } = require("../constants");
const readline = require("readline");

function promptInput(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function run(args) {
  console.log(`\n🧪 HiperRouter Multi-Model Parallel Playground`);
  console.log(`==============================================\n`);

  const promptText = await promptInput("Digite o prompt para testar nos modelos em paralelo: ");
  if (!promptText) {
    console.log("❌ Prompt vazio. Operação cancelada.\n");
    return 0;
  }

  const models = ["gpt-4o", "claude-3-5-sonnet", "gemini-1-5-pro"];
  console.log(`\n⏳ Disparando prompt para os modelos em paralelo (${models.join(", ")})...\n`);

  const promises = models.map(async (m) => {
    const start = Date.now();
    try {
      const res = await fetch(`http://localhost:${DEFAULT_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: m,
          messages: [{ role: "user", content: promptText }],
          max_tokens: 150
        })
      });
      const data = await res.json();
      const elapsed = Date.now() - start;
      const text = data.choices?.[0]?.message?.content || "Sem resposta";
      return { model: m, elapsed, text, ok: true };
    } catch (e) {
      return { model: m, elapsed: Date.now() - start, text: e.message, ok: false };
    }
  });

  const results = await Promise.all(promises);

  console.log(`\n================ RESULTADOS PARALELOS ================`);
  for (const r of results) {
    console.log(`\n🤖 Modelo: ${r.model} (${r.elapsed}ms) [${r.ok ? "🟢 OK" : "🔴 ERRO"}]`);
    console.log(`💬 Resposta:\n${r.text}`);
    console.log(`------------------------------------------------------`);
  }

  console.log("");
  await pause();
  return 0;
}

module.exports = { run };
