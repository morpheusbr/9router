const { COLORS } = require("../utils/input");
const { spawnSync } = require("child_process");

/**
 * Comprime um array de mensagens de histórico descartadas usando a LLM
 * para gerar um "Fatos e Decisões" resumido.
 * 
 * @param {Array} displacedMessages - As mensagens antigas que seriam descartadas
 * @param {Object} options - { port, apiKey, model }
 * @returns {Promise<string>} O resumo em texto
 */
async function compressHistory(displacedMessages, options) {
  const { port, apiKey, model } = options;
  if (!displacedMessages || displacedMessages.length === 0) return "";

  // Extrair texto limpo para o prompt
  const logToCompress = displacedMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n\n");

  const systemPrompt = `Você é um motor de compressão de memória do projeto (Memory Engine).
Seu objetivo é ler o histórico antigo de conversas e extrair APENAS fatos técnicos críticos, decisões de design tomadas, bugs resolvidos e ferramentas utilizadas.
Crie um resumo ultracompacto (bullet points) para ser injetado de volta na IA.
Não invente informações e não responda com cortesias. Seja direto.`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Resuma o seguinte histórico descartado:\n\n${logToCompress.substring(0, 80000)}` }
  ];

  try {
    process.stdout.write(`\n${COLORS.dim}[Memory Engine: Comprimindo ${displacedMessages.length} mensagens antigas...]${COLORS.reset}`);
    
    const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "x-hiperrouter-cli": "true" // Evita rate limit estrito do proxy se aplicável
      },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      console.log(`\n${COLORS.yellow}⚠️  Falha na compressão de memória: ${response.statusText}${COLORS.reset}`);
      return "";
    }

    const data = await response.json();
    const summary = data.choices && data.choices[0] && data.choices[0].message.content;
    
    if (summary) {
       console.log(`\n${COLORS.dim}[Memory Engine: Contexto histórico consolidado. Salvando no Graphify...]${COLORS.reset}`);
       
       const question = `Decisões e Contexto da Sessão (${new Date().toLocaleString()})`;
       const args = ['graphify', 'save-result', '--question', question, '--answer', summary, '--type', 'explain'];
       
       try {
         spawnSync('rtk', args, { stdio: 'ignore' });
         console.log(`${COLORS.dim}[Memory Engine: Memória enraizada no Knowledge Graph com sucesso!]${COLORS.reset}`);
         
         // Opcionalmente dar trigger num update em background
         spawnSync('rtk', ['graphify', 'update', '.'], { stdio: 'ignore' });
       } catch (e) {
         console.log(`${COLORS.yellow}⚠️ Falha ao acionar graphify save-result: ${e.message}${COLORS.reset}`);
       }
       
       return summary.trim();
    }
    
    return "";
  } catch (error) {
    console.log(`\n${COLORS.yellow}⚠️  Falha na compressão de memória: ${error.message}${COLORS.reset}`);
    return "";
  }
}

module.exports = { compressHistory };
