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
  const promptText = args.join(" ") || (await promptInput("Digite a questão para consenso entre modelos: "));
  if (!promptText) {
    console.log("❌ Nenhuma questão informada.\n");
    return 0;
  }

  console.log(`\n🧠 HiperRouter Multi-Model Consensus Engine`);
  console.log(`===========================================\n`);
  console.log(`⏳ Disparando consulta em paralelo para OpenAI, Anthropic e Gemini...`);

  const models = ["gpt-4o", "claude-3-5-sonnet", "gemini-1-5-pro"];
  const promises = models.map(async (m) => {
    try {
      const res = await fetch(`http://localhost:${DEFAULT_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: m,
          messages: [{ role: "user", content: promptText }],
          max_tokens: 300
        })
      });
      const data = await res.json();
      return { model: m, content: data.choices?.[0]?.message?.content || "" };
    } catch {
      return { model: m, content: "Erro ao consultar modelo." };
    }
  });

  const responses = await Promise.all(promises);

  console.log(`\n🔍 Sintetizando respostas e buscando consenso perfeito...`);

  const synthesisPrompt = `Você é o Consensual Engine do HiperRouter. Analise as 3 respostas trazidas por diferentes modelos para a pergunta: "${promptText}".
Respostas:
1. (${responses[0].model}): ${responses[0].content}
2. (${responses[1].model}): ${responses[1].content}
3. (${responses[2].model}): ${responses[2].content}

Sintetize a resposta definitiva unificando os pontos fortes e eliminando qualquer erro ou divergência.`;

  try {
    const synRes = await fetch(`http://localhost:${DEFAULT_PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: synthesisPrompt }],
        max_tokens: 500
      })
    });
    const synData = await synRes.json();
    const finalContent = synData.choices?.[0]?.message?.content || "Falha na síntese.";

    console.log(`\n🎯 RESPOSTA DEFINITIVA POR CONSENSO:\n`);
    console.log(finalContent);
  } catch (e) {
    console.log(`❌ Erro no consenso: ${e.message}`);
  }

  console.log(`\n===========================================\n`);
  await pause();
  return 0;
}

module.exports = { run };
