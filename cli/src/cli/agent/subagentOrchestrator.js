const { COLORS } = require("../utils/input");

/**
 * Orquestra subagentes (Arquiteto e QA) antes de repassar a tarefa
 * ao engenheiro principal (AgentRuntime).
 * 
 * @param {string} taskPrompt - A tarefa original do usuário
 * @param {string} projectContext - Contexto global (regras e graphify)
 * @param {Object} options - { port, apiKey, model }
 * @returns {Promise<string>} O contexto expandido com o plano do arquiteto e revisão de QA
 */
async function orchestrateCodeSubagents(taskPrompt, projectContext, options) {
  const { port, apiKey, model } = options;

  async function askSubagent(roleName, systemPrompt, userMessage) {
    process.stdout.write(`\n${COLORS.cyan}[Subagent: ${roleName}] Analisando...${COLORS.reset}`);
    try {
      const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "x-hiperrouter-cli": "true"
        },
        body: JSON.stringify({ 
          model, 
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          stream: false 
        }),
        signal: AbortSignal.timeout(120000)
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const reply = data.choices && data.choices[0] && data.choices[0].message.content;
      console.log(` ${COLORS.green}OK!${COLORS.reset}`);
      return reply || "";
    } catch (e) {
      console.log(` ${COLORS.red}Falha (${e.message})${COLORS.reset}`);
      return `[Falha no subagente ${roleName}]`;
    }
  }

  // 1. Arquiteto
  const architectSys = `Você é um Arquiteto de Software Sênior. 
Analise a requisição e o contexto do projeto. Gere um Plano de Implementação detalhado em Markdown, listando os arquivos a serem criados/modificados e uma breve descrição da lógica (não gere o código final nem use XML tags).
Contexto do Projeto:\n${projectContext}`;
  
  const architectPlan = await askSubagent("Arquiteto", architectSys, `Tarefa do usuário: ${taskPrompt}\nCrie o plano de implementação.`);

  // 2. QA
  const qaSys = `Você é um Engenheiro de Segurança e QA.
Sua tarefa é ler o Plano de Implementação do Arquiteto e apontar possíveis falhas de segurança, edge cases, problemas de arquitetura e impacto em regras de negócio.
Seja muito severo e crítico. Sugira correções.
Contexto do Projeto:\n${projectContext}`;

  const qaReview = await askSubagent("QA & Security", qaSys, `Plano do Arquiteto:\n${architectPlan}\n\nForneça sua auditoria crítica e correções necessárias.`);

  // Retorna o pacote completo para o Main Agent
  const expandedPrompt = `Tarefa Original do Usuário: ${taskPrompt}

---
PLANO DE IMPLEMENTAÇÃO (Sugerido pelo Arquiteto):
${architectPlan}

---
AUDITORIA DE QA & SEGURANÇA:
${qaReview}

---
INSTRUÇÃO FINAL (Você é o Desenvolvedor Principal):
Com base na tarefa original, no plano do arquiteto e nas correções do QA, utilize suas ferramentas (terminal, patch, file) para implementar a solução com segurança.`;

  return expandedPrompt;
}

module.exports = { orchestrateCodeSubagents };
