const { COLORS } = require("../utils/input");
const { DEFAULT_PORT } = require("../constants");
const configStore = require("../utils/configStore");
const api = require("../api/client");

async function run(args) {
  const promptText = args.join(" ");
  if (!promptText) {
    console.log(`${COLORS.red}❌ Uso: /playground <prompt>${COLORS.reset}\n`);
    return 0;
  }

  // Get user's models
  let models = configStore.getArray("favoriteModels").filter(m => m && m.length > 0);
  if (models.length < 2) {
    try {
      const res = await api.getModels();
      if (res.success && res.data?.models) {
        const available = res.data.models
          .filter(m => !m.id.includes('combo'))
          .map(m => m.id)
          .slice(0, 5);
        if (available.length >= 2) models = available;
      }
    } catch {}
  }
  if (models.length < 2) {
    models = ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"];
    console.log(`${COLORS.yellow}⚠️ Usando modelos padrão (configure favoritos com /fav)${COLORS.reset}`);
  }

  console.log(`\n🧪 ${COLORS.bright}${COLORS.cyan}PARALLEL PLAYGROUND${COLORS.reset}`);
  console.log(`${"─".repeat(50)}\n`);
  console.log(`${COLORS.dim}Prompt: "${promptText.substring(0, 80)}${promptText.length > 80 ? '...' : ''}"${COLORS.reset}`);
  console.log(`${COLORS.dim}Modelos: ${models.join(', ')}${COLORS.reset}\n`);
  console.log(`⏳ Disparando para ${models.length} modelos em paralelo...\n`);

  const promises = models.map(async (m) => {
    const start = Date.now();
    try {
      process.stdout.write(`  🔹 ${m}... `);
      const res = await fetch(`http://localhost:${DEFAULT_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: m,
          messages: [{ role: "user", content: promptText }],
          max_tokens: 300
        }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      const elapsed = Date.now() - start;
      if (data.error) {
        console.log(`${COLORS.red}Erro (${elapsed}ms)${COLORS.reset}`);
        return { model: m, elapsed, text: `[Erro: ${data.error.message}]`, ok: false };
      }
      const text = data.choices?.[0]?.message?.content || "Sem resposta";
      console.log(`${COLORS.green}OK (${elapsed}ms, ${text.length} chars)${COLORS.reset}`);
      return { model: m, elapsed, text, ok: true };
    } catch (e) {
      const elapsed = Date.now() - start;
      console.log(`${COLORS.red}Falha (${elapsed}ms)${COLORS.reset}`);
      return { model: m, elapsed, text: e.message, ok: false };
    }
  });

  const results = await Promise.all(promises);

  // Show results side by side
  console.log(`\n${"═".repeat(50)}`);
  for (const r of results) {
    const status = r.ok ? `${COLORS.green}🟢 OK` : `${COLORS.red}🔴 ERRO`;
    console.log(`\n${status} ${COLORS.cyan}${r.model}${COLORS.reset} ${COLORS.dim}(${r.elapsed}ms)${COLORS.reset}`);
    console.log(`${"─".repeat(40)}`);
    console.log(r.text);
  }
  console.log(`\n${"═".repeat(50)}\n`);

  // Show latency ranking
  const ranked = [...results].filter(r => r.ok).sort((a, b) => a.elapsed - b.elapsed);
  if (ranked.length > 1) {
    console.log(`${COLORS.bright}⚡ Ranking de velocidade:${COLORS.reset}`);
    ranked.forEach((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
      console.log(`  ${medal} ${r.model}: ${r.elapsed}ms`);
    });
    console.log();
  }

  return 0;
}

module.exports = { run };
