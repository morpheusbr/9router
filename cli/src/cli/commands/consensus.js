const { pause, COLORS } = require("../utils/input");
const { DEFAULT_PORT } = require("../constants");
const configStore = require("../utils/configStore");
const api = require("../api/client");

async function run(args) {
  const promptText = args.join(" ");
  if (!promptText) {
    console.log(`${COLORS.red}❌ Uso: /consensus <pergunta>${COLORS.reset}\n`);
    return 0;
  }

  // Get user's models from favorites, or fallback to available models
  let models = configStore.getArray("favoriteModels").filter(m => m && m.length > 0);

  if (models.length < 2) {
    // Try to get models from the server
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

  // Use the first model for synthesis (or user's default)
  const synthesisModel = configStore.get("defaultModel") || models[0];

  console.log(`\n🧠 ${COLORS.bright}${COLORS.cyan}CONSENSUS ENGINE${COLORS.reset}`);
  console.log(`${"─".repeat(50)}\n`);
  console.log(`${COLORS.dim}Modelos: ${models.join(', ')}${COLORS.reset}`);
  console.log(`${COLORS.dim}Síntese: ${synthesisModel}${COLORS.reset}\n`);

  // Query all models in parallel
  console.log(`⏳ Consultando ${models.length} modelos em paralelo...\n`);
  const promises = models.map(async (m) => {
    try {
      process.stdout.write(`  🔹 ${m}... `);
      const res = await fetch(`http://localhost:${DEFAULT_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: m,
          messages: [{ role: "user", content: promptText }],
          max_tokens: 500
        }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (data.error) {
        console.log(`${COLORS.red}Erro: ${data.error.message || 'desconhecido'}${COLORS.reset}`);
        return { model: m, content: `[Erro: ${data.error.message || 'desconhecido'}]` };
      }
      const content = data.choices?.[0]?.message?.content || "";
      console.log(`${COLORS.green}OK (${content.length} chars)${COLORS.reset}`);
      return { model: m, content };
    } catch (e) {
      console.log(`${COLORS.red}Falha: ${e.message}${COLORS.reset}`);
      return { model: m, content: `[Falha: ${e.message}]` };
    }
  });

  const responses = await Promise.all(promises);

  // Filter successful responses
  const valid = responses.filter(r => !r.content.startsWith('[Erro') && !r.content.startsWith('[Falha'));
  if (valid.length === 0) {
    console.log(`\n${COLORS.red}❌ Nenhum modelo respondeu com sucesso.${COLORS.reset}\n`);
    return 1;
  }

  // Synthesis
  console.log(`\n🔄 Sintetizando ${valid.length} respostas...`);

  const synthesisPrompt = `Você é o Consensual Engine do HiperRouter. Analise as ${valid.length} respostas de diferentes modelos para a pergunta: "${promptText}".
Respostas:
${valid.map((r, i) => `${i + 1}. (${r.model}): ${r.content}`).join('\n\n')}

Sintetize a resposta definitiva unificando os pontos fortes e eliminando qualquer erro ou divergência. Seja conciso.`;

  try {
    const synRes = await fetch(`http://localhost:${DEFAULT_PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: synthesisModel,
        messages: [{ role: "user", content: synthesisPrompt }],
        max_tokens: 800
      }),
      signal: AbortSignal.timeout(60000),
    });
    const synData = await synRes.json();
    const finalContent = synData.choices?.[0]?.message?.content || "Falha na síntese.";

    console.log(`\n${"─".repeat(50)}`);
    console.log(`🎯 ${COLORS.bright}RESPOSTA POR CONSENSO:${COLORS.reset}\n`);
    console.log(finalContent);
  } catch (e) {
    console.log(`${COLORS.red}❌ Erro na síntese: ${e.message}${COLORS.reset}`);
  }

  console.log(`\n${"─".repeat(50)}\n`);
  return 0;
}

module.exports = { run };
