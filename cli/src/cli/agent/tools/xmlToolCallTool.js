/**
 * xmlToolCallTool — Processa blocos <tool_call> XML da resposta da IA.
 *
 * Suporta funções: bash, grep, query-graph.
 * Fase: 'post' (processado após o streaming completo)
 */

const { runBashCommand } = require("../bashExecutor");

module.exports = {
  name: "xmlToolCall",
  description: "Processa Tool Calls em formato XML (<tool_call>...<function>...</function></tool_call>)",
  phase: "post",

  /**
   * Extrai todas as tool calls XML da mensagem da IA.
   * @param {string} aiFullMessage
   * @returns {Array<{funcName: string, cmd: string, rawMatch: string}>}
   */
  extract(aiFullMessage) {
    const matches = [...aiFullMessage.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/gi)];
    const actions = [];

    for (const match of matches) {
      const innerContent = match[1];
      const rawMatch = match[0];
      
      const functionMatch = innerContent.match(/<function[\s=]+(?:name=)?"?([^>"]+)"?>([\s\S]*?)<\/function>/i);
      
      if (!functionMatch) {
        actions.push({ funcName: "MALFORMED_TOOL_CALL", cmd: "", rawMatch, unknown: true });
        continue;
      }

      const funcName = functionMatch[1].trim();
      const paramsBlock = functionMatch[2];
      let cmd = "";

      if (funcName === "bash") {
        const cmdMatch = paramsBlock.match(/<parameter[^>]*?command[^>]*?>([\s\S]*?)<\/parameter>/i);
        if (cmdMatch) cmd = cmdMatch[1].trim();
      } else if (funcName === "grep") {
        const patternMatch = paramsBlock.match(/<parameter[^>]*?pattern[^>]*?>([\s\S]*?)<\/parameter>/i);
        const pathMatch = paramsBlock.match(/<parameter[^>]*?path[^>]*?>([\s\S]*?)<\/parameter>/i);
        if (patternMatch && pathMatch) {
          cmd = `rtk grep -rin "${patternMatch[1].trim()}" ${pathMatch[1].trim()}`;
        }
      } else if (funcName === "query-graph" || funcName === "query_graph") {
        const qMatch = paramsBlock.match(/<parameter[^>]*?question[^>]*?>([\s\S]*?)<\/parameter>/i);
        if (qMatch) cmd = `rtk graphify query "${qMatch[1].trim()}"`;
      }

      if (cmd) {
        actions.push({ funcName, cmd, rawMatch });
      } else {
        actions.push({ funcName, cmd: "", rawMatch, unknown: true });
      }
    }

    return actions;
  },

  /**
   * Executa uma tool call XML.
   * @param {{funcName: string, cmd: string, unknown?: boolean}} action
   * @param {object} context
   * @returns {Promise<{aiThinking: boolean, shouldBreak: boolean}>}
   */
  async execute(action, context) {
    const { messages, aiFullMessage, confirmFn, ctxLimit, signal } = context;
    const { COLORS } = require("../../utils/input");

    if (action.unknown) {
      // Função desconhecida — avisa o modelo
      console.log(`\n${COLORS.red}⚠️ IA tentou usar ferramenta inexistente: ${action.funcName}${COLORS.reset}`);
      messages.push({ role: "assistant", content: aiFullMessage });
      messages.push({ role: "system", content: `Erro: A função '${action.funcName}' não existe no God Mode. Você DEVE usar um bloco markdown \`\`\`bash\`\`\` para rodar comandos como 'rtk cat', 'rtk sed', etc.` });
      return { aiThinking: true, shouldBreak: true };
    }

    return runBashCommand(action.cmd, {
      confirmLabel: `Permitir Tool Call (${action.funcName})?`,
      confirmFeedbackMsg: 'O usuário abortou a execução e enviou este feedback',
      messages,
      aiFullMessage,
      pushAssistantFirst: true,
      feedbackToAI: true,
      confirmFn,
      ctxLimit,
      signal,
    });
  }
};
