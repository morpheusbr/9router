/**
 * bashTool — Detecta e executa blocos ```bash do markdown da IA.
 *
 * Fase: 'post' (processado após o streaming, respeitando xmlToolCall)
 */

const { runBashCommand } = require("../bashExecutor");

module.exports = {
  name: "bash",
  description: "Executa blocos de código bash (```bash ... ```) da resposta da IA",
  phase: "post",

  /**
   * Extrai todos os blocos ```bash``` OU <rtk>...</rtk> da mensagem da IA.
   * Ignora se houver <tool_call> (processado por xmlToolCallTool).
   * @param {string} aiFullMessage
   * @returns {Array<{command: string}>}
   */
  extract(aiFullMessage) {
    // Se houver XML tool calls, o bashTool não age (evita duplicatas)
    if (aiFullMessage.includes('<tool_call>')) return [];

    const actions = [];
    
    // Pattern 1: ```bash ... ```
    const bashMatches = [...aiFullMessage.matchAll(/```bash\n([\s\S]*?)```/g)];
    for (const m of bashMatches) {
      const cmd = m[1].trim();
      if (cmd.length > 0) actions.push({ command: cmd });
    }
    
    // Pattern 2: <rtk>...</rtk> or <rtk command>...</rtk>
    const rtkMatches = [...aiFullMessage.matchAll(/<rtk(?:\s[^>]*)?>([\s\S]*?)<\/rtk>/gi)];
    for (const m of rtkMatches) {
      const cmd = m[1].trim();
      if (cmd.length > 0) actions.push({ command: cmd });
    }
    
    return actions;
  },

  /**
   * Executa um bloco bash extraído.
   * @param {{command: string}} action
   * @param {object} context
   * @returns {Promise<{aiThinking: boolean, shouldBreak: boolean}>}
   */
  async execute(action, context) {
    const { messages, aiFullMessage, confirmFn, executedCmds, ctxLimit, signal } = context;

    // Pula comandos já executados neste turno
    if (executedCmds && executedCmds.has(action.command)) {
      return { aiThinking: false, shouldBreak: false };
    }
    if (executedCmds) executedCmds.add(action.command);

    return runBashCommand(action.command, {
      confirmLabel: 'Permitir Execução de Bash?',
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
