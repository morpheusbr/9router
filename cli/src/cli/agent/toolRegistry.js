/**
 * ToolRegistry — Registro extensível de ferramentas para o Agent Runtime.
 *
 * Cada tool segue a interface:
 * {
 *   name: string,
 *   description: string,
 *   phase: 'streaming' | 'post',   // Ordem de execução
 *   extract(aiFullMessage): Array<{...params}>,  // Extrai ações do texto da IA
 *   execute(action, context): Promise<{aiThinking, shouldBreak}>
 * }
 *
 * O context passado para execute() contém:
 * {
 *   messages: Array,         // Array de mensagens do chat (mutável)
 *   aiFullMessage: string,   // Resposta completa da IA
 *   confirm: Function,       // Função de confirmação interativa
 *   sanitize: Function,      // Sanitizador de secrets
 *   executedCmds: Set,       // Comandos já executados neste turno
 *   port: number,
 *   model: string,
 *   cwd: string,
 * }
 */

class ToolRegistry {
  constructor() {
    /** @type {Array<object>} */
    this._tools = [];
  }

  /**
   * Registra uma nova ferramenta.
   * @param {object} tool - Tool com interface { name, description, phase, extract, execute }
   */
  register(tool) {
    if (!tool || typeof tool !== "object" || typeof tool.name !== "string" || !tool.name.trim()
      || typeof tool.extract !== "function" || typeof tool.execute !== "function") {
      throw new Error(`Tool inválida: faltam propriedades obrigatórias (name, extract, execute)`);
    }
    if (tool.phase !== undefined && tool.phase !== "streaming" && tool.phase !== "post") {
      throw new Error(`Tool '${tool.name}' possui fase inválida: ${tool.phase}`);
    }
    if (tool.description !== undefined && typeof tool.description !== "string") {
      throw new Error(`Tool '${tool.name}' possui descrição inválida`);
    }
    // Evitar duplicatas
    if (this._tools.some(t => t.name === tool.name)) {
      throw new Error(`Tool '${tool.name}' já registrada.`);
    }
    this._tools.push(Object.freeze({ ...tool }));
  }

  /**
   * Retorna todas as tools registradas, ordenadas por fase.
   */
  getAll() {
    return [...this._tools].sort((a, b) => {
      if (a.phase === b.phase) return 0;
      return a.phase === "streaming" ? -1 : 1;
    });
  }

  /**
   * Retorna tools filtradas por fase.
   * @param {'streaming' | 'post'} phase
   */
  getByPhase(phase) {
    return this._tools.filter(t => t.phase === phase);
  }

  /**
   * Retorna uma tool pelo nome.
   * @param {string} name
   */
  get(name) {
    return this._tools.find(t => t.name === name) || null;
  }

  /**
   * Lista nomes de todas as tools registradas.
   */
  listNames() {
    return this._tools.map(t => t.name);
  }
}

/**
 * Cria um ToolRegistry com todas as tools padrão do HiperRouter.
 * @returns {ToolRegistry}
 */
function createDefaultRegistry() {
  const registry = new ToolRegistry();

  registry.register(require("./tools/xmlToolCallTool"));
  registry.register(require("./tools/bashTool"));
  registry.register(require("./tools/grepTool"));
  registry.register(require("./tools/fetchTool"));
  registry.register(require("./tools/patchTool"));
  registry.register(require("./tools/fileTool"));
  registry.register(require("./tools/mcpTool"));

  return registry;
}

module.exports = { ToolRegistry, createDefaultRegistry };
