/**
 * grepTool — Auto-Discovery via <grep search="..." />.
 *
 * Permite que a IA busque código no repositório sem usar bash.
 * Fase: 'post'
 */

const { execSync } = require("child_process");
const { COLORS } = require("../../utils/input");

module.exports = {
  name: "grep",
  description: "Auto-Discovery: busca termos no repositório via <grep search=\"...\" />",
  phase: "post",

  /**
   * Extrai tags <grep search="..." /> da mensagem da IA.
   * @param {string} aiFullMessage
   * @returns {Array<{term: string}>}
   */
  extract(aiFullMessage) {
    const matches = [...aiFullMessage.matchAll(/<grep\s+search="([^"]+)"\s*\/>/g)];
    return matches.map(m => ({ term: m[1] }));
  },

  /**
   * Executa busca git grep e injeta resultado nas mensagens.
   * @param {{term: string}} action
   * @param {object} context
   * @returns {Promise<{aiThinking: boolean, shouldBreak: boolean}>}
   */
  async execute(action, context) {
    const { messages } = context;
    const { term } = action;

    console.log(`\n${COLORS.dim}🔍 [IA Auto-Discovery: Buscando internamente por '${term}'...]${COLORS.reset}`);

    let grepResult = "";
    try {
      // JSON.stringify escapa o termo para evitar shell injection vindo da IA
      grepResult = execSync(`rtk git grep -in -- ${JSON.stringify(term)} | head -n 30`, { encoding: "utf8" });
    } catch (e) {
      grepResult = "(Nenhum resultado encontrado)";
    }

    messages.push({
      role: "system",
      content: `Resultado da busca interna para '${term}':\n\`\`\`\n${grepResult || 'Nada encontrado.'}\n\`\`\`\nContinue seu raciocínio.`
    });

    return { aiThinking: true, shouldBreak: true };
  }
};
