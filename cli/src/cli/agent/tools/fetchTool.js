/**
 * fetchTool — Web Surfing via <fetch url="..." />.
 *
 * Permite que a IA leia conteúdo de URLs sem usar bash.
 * Fase: 'post'
 */

const { COLORS } = require("../../utils/input");

module.exports = {
  name: "fetch",
  description: "Web Surfing: lê conteúdo de URLs via <fetch url=\"...\" />",
  phase: "post",

  /**
   * Extrai tags <fetch url="..." /> da mensagem da IA.
   * @param {string} aiFullMessage
   * @returns {Array<{url: string}>}
   */
  extract(aiFullMessage) {
    const match = aiFullMessage.match(/<fetch\s+url="([^"]+)"\s*\/>/);
    if (!match) return [];
    return [{ url: match[1] }];
  },

  /**
   * Faz fetch da URL, strip HTML, e injeta no contexto de mensagens.
   * @param {{url: string}} action
   * @param {object} context
   * @returns {Promise<{aiThinking: boolean, shouldBreak: boolean}>}
   */
  async execute(action, context) {
    const { messages } = context;
    const { url } = action;

    console.log(`\n${COLORS.dim}🌐 [IA Web Surfing: Lendo conteúdo de '${url}'...]${COLORS.reset}`);

    let webContent = "";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const html = await res.text();
      // Strip HTML tags e normaliza whitespace
      webContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 15000);
    } catch (e) {
      webContent = e.name === 'TimeoutError'
        ? `Timeout: URL não respondeu em 10s.`
        : "Falha ao acessar URL.";
    }

    messages.push({
      role: "system",
      content: `Conteúdo lido da URL '${url}':\n\`\`\`\n${webContent}\n\`\`\`\nContinue seu raciocínio baseando-se nestes dados.`
    });

    return { aiThinking: true, shouldBreak: true };
  }
};
