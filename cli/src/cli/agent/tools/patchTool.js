/**
 * patchTool — Edição cirúrgica de arquivos via <patch path="...">...</patch>.
 *
 * Delega para o processPatches do patchEngine.
 * Fase: 'post'
 */

const { processPatches } = require("../../chat/patchEngine");

module.exports = {
  name: "patch",
  description: "Edição cirúrgica de arquivos via <patch path=\"...\">...</patch>",
  phase: "post",

  /**
   * Verifica se há blocos <patch> na mensagem da IA.
   * Retorna uma ação genérica — o parsing detalhado é feito por processPatches.
   * @param {string} aiFullMessage
   * @returns {Array<{type: string}>}
   */
  extract(aiFullMessage) {
    if (/<patch\s+path=/.test(aiFullMessage)) {
      return [{ type: "patch" }];
    }
    return [];
  },

  /**
   * Executa o processamento de patches.
   * @param {{type: string}} _action
   * @param {object} context
   * @returns {Promise<{aiThinking: boolean, shouldBreak: boolean}>}
   */
  async execute(_action, context) {
    const { messages, aiFullMessage } = context;
    const result = await processPatches(aiFullMessage, messages);
    return { aiThinking: result.aiThinking || false, shouldBreak: result.aiThinking || false };
  }
};
