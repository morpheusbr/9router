/**
 * fileTool — Criação de arquivos novos via <file path="...">conteúdo</file>.
 *
 * Delega para o processNewFiles do patchEngine.
 * Fase: 'post'
 */

const { processNewFiles } = require("../../chat/patchEngine");

module.exports = {
  name: "file",
  description: "Criação de arquivos novos via <file path=\"...\">conteúdo</file>",
  phase: "post",

  /**
   * Verifica se há blocos <file> na mensagem da IA.
   * Retorna uma ação genérica — o parsing detalhado é feito por processNewFiles.
   * @param {string} aiFullMessage
   * @returns {Array<{type: string}>}
   */
  extract(aiFullMessage) {
    if (/<file\s+path=/.test(aiFullMessage)) {
      return [{ type: "file" }];
    }
    return [];
  },

  /**
   * Executa o processamento de criação de arquivos.
   * @param {{type: string}} _action
   * @param {object} context
   * @returns {Promise<{aiThinking: boolean, shouldBreak: boolean}>}
   */
  async execute(_action, context) {
    const { messages, aiFullMessage } = context;
    const result = await processNewFiles(aiFullMessage, messages);
    return { aiThinking: result.aiThinking || false, shouldBreak: result.aiThinking || false };
  }
};
