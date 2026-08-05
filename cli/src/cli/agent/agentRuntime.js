/**
 * agentRuntime.js — Core do Agent Runtime do HiperRouter.
 *
 * Implementa o ciclo formal:
 *   [LLM] --"rode X"--> [Agent Runtime] --executa--> [Terminal]
 *                                         <--stdout--
 *   [LLM] <--"saída Y"--
 *
 * State Machine:
 *   IDLE → STREAMING → TOOL_PROCESSING → (EXECUTING → FEEDBACK →) → DONE
 *                  ↑_________________________________________|
 *                           (aiThinking = true)
 *
 * Emite eventos para a camada de apresentação (chatUI):
 *   'stream_start'         - Início do streaming SSE
 *   'chunk', text          - Chunk de texto visível (sem <tool_call>)
 *   'tool_call_start'      - Detectou <tool_call> no stream
 *   'tool_call_end'        - Fim da <tool_call> no stream
 *   'stream_end', msg      - Streaming SSE terminou
 *   'tool_executing', info - Executando uma tool
 *   'thinking'             - Re-entrando no LLM (loop autônomo)
 *   'done', result         - Loop finalizado
 *   'error', err           - Erro
 */

const EventEmitter = require("events");
const { COLORS } = require("../utils/input");
const { runBashCommand } = require("./bashExecutor");

// --- Runtime States ---
const STATE = {
  IDLE: "idle",
  STREAMING: "streaming",
  TOOL_PROCESSING: "tool_processing",
  EXECUTING: "executing",
  DONE: "done",
};

class AgentRuntime extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number} opts.port          - Porta do servidor HiperRouter
   * @param {string} opts.apiKey        - API key para autenticação
   * @param {string} opts.model         - Modelo LLM ativo
   * @param {import('./toolRegistry').ToolRegistry} opts.toolRegistry - Registry de ferramentas
   * @param {Function} opts.confirmFn   - Função de confirmação interativa
   */
  constructor({ port, apiKey, model, toolRegistry, confirmFn }) {
    super();
    this.port = port;
    this.apiKey = apiKey;
    this.model = model;
    this.toolRegistry = toolRegistry;
    this.confirmFn = confirmFn;
    this.state = STATE.IDLE;

    // Métricas de sessão acumuladas por run()
    this._requestCount = 0;
    this._totalTokens = 0;
  }

  /**
   * Atualiza o modelo ativo (ex: após /model).
   * @param {string} newModel
   */
  setModel(newModel) {
    this.model = newModel;
  }

  /**
   * Executa o ciclo completo do Agent Runtime.
   *
   * Fluxo:
   * 1. Envia mensagens para a LLM via streaming SSE
   * 2. Parseia a resposta completa em busca de tool calls
   * 3. Executa cada tool via toolRegistry
   * 4. Se alguma tool definir aiThinking=true, volta ao passo 1
   * 5. Retorna quando o loop finalizar
   *
   * @param {Array} messages - Array de mensagens do chat (mutável)
   * @param {object} opts
   * @param {string} opts.currentCommand - Comando slash ativo (ex: '/plan', '/code')
   * @returns {Promise<{requestCount: number, totalTokens: number, finalMessage: string}>}
   */
  async run(messages, opts = {}) {
    this._requestCount = 0;
    this._totalTokens = 0;

    let aiThinking = true;
    let rateLimitRetries = 0;
    const MAX_RATE_LIMIT_RETRIES = 5;
    let finalMessage = "";

    while (aiThinking) {
      aiThinking = false;
      this.state = STATE.STREAMING;

      try {
        // --- 1. Streaming SSE para a LLM ---
        this.emit("stream_start");
        this._requestCount++;

        const { aiFullMessage, tokenCount, error, rateLimited, retryAfter } =
          await this._streamLLM(messages);

        if (rateLimited) {
          rateLimitRetries++;
          if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
            console.log(`\n${COLORS.red}❌ Rate limit atingido ${MAX_RATE_LIMIT_RETRIES}x consecutivas. Troque de modelo com /model ou aguarde.${COLORS.reset}\n`);
            messages.pop();
            break;
          }
          // Exponential backoff with jitter: 5s, 10s, 20s, 40s + random 0-3s
          const baseDelay = Math.min(5 * Math.pow(2, rateLimitRetries - 1), 60);
          const jitter = Math.floor(Math.random() * 3);
          const waitTime = Math.min(isNaN(retryAfter) ? baseDelay + jitter : retryAfter, 60);
          console.log(`\n${COLORS.yellow}⚠️  Rate limit (429) no modelo '${this.model}' — aguardando ${waitTime}s... (tentativa ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})${COLORS.reset}`);
          await new Promise(r => setTimeout(r, waitTime * 1000));
          // Pop duplicata
          if (messages.length > 0 && messages[messages.length - 1].role === 'user') messages.pop();
          aiThinking = true;
          continue;
        }
        rateLimitRetries = 0;

        if (error) {
          this.emit("error", error);
          messages.pop();
          break;
        }

        this._totalTokens += tokenCount;
        finalMessage = aiFullMessage;
        this.emit("stream_end", aiFullMessage);

        // --- 2. Processar Tool Calls ---
        this.state = STATE.TOOL_PROCESSING;
        const executedCmds = new Set();

        const context = {
          messages,
          aiFullMessage,
          confirmFn: this.confirmFn,
          executedCmds,
          port: this.port,
          model: this.model,
          cwd: process.cwd(),
        };

        // Executar tools na ordem do registry
        const allTools = this.toolRegistry.getAll();
        let toolTookOver = false;

        for (const tool of allTools) {
          if (aiThinking) break;

          const actions = tool.extract(aiFullMessage);
          if (actions.length === 0) continue;

          this.state = STATE.EXECUTING;

          for (const action of actions) {
            this.emit("tool_executing", { tool: tool.name, action });

            const result = await tool.execute(action, context);

            if (result.shouldBreak) {
              aiThinking = result.aiThinking;
              toolTookOver = true;
              break;
            }
          }

          if (toolTookOver) break;
        }

        // --- 3. Self-Healing Bash (post-pass APENAS se nenhuma bash block foi executada) ---
        if (!aiThinking && !toolTookOver && executedCmds.size === 0) {
          const shResult = await this._selfHealingBashPass(aiFullMessage, messages, executedCmds);
          if (shResult.aiThinking) {
            aiThinking = true;
            continue;
          }
        }

        // --- 4. Push assistant message se nenhuma tool tomou controle ---
        if (!aiThinking && aiFullMessage && aiFullMessage.trim().length > 0) {
          messages.push({ role: "assistant", content: aiFullMessage });
        }

        console.log("\n");

        if (aiThinking) {
          this.emit("thinking");
        }

      } catch (err) {
        const errMsg = err.message || String(err);
        console.log(`\n${COLORS.red}Falha na comunicação: ${errMsg}${COLORS.reset}`);

        // Smart suggestions based on error type
        if (errMsg.includes('timeout') || errMsg.includes('TIMEOUT')) {
          console.log(`${COLORS.dim}💡 Contexto pode estar grande. Tente /clear ou aguarde compressão automática.${COLORS.reset}`);
        } else if (errMsg.includes('429') || errMsg.includes('rate')) {
          console.log(`${COLORS.dim}💡 Rate limit. Tente /model para trocar de modelo.${COLORS.reset}`);
        } else if (errMsg.includes('401') || errMsg.includes('403')) {
          console.log(`${COLORS.dim}💡 Erro de autenticação. Verifique suas API keys com /key.${COLORS.reset}`);
        } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed')) {
          console.log(`${COLORS.dim}💡 Servidor offline. Verifique com /status ou reinicie com hiperrouter.${COLORS.reset}`);
        } else if (errMsg.includes('context') || errMsg.includes('token')) {
          console.log(`${COLORS.dim}💡 Contexto excedido. Use /clear para resetar.${COLORS.reset}`);
        }

        messages.pop();
        aiThinking = false;
        this.emit("error", err);
      }
    }

    this.state = STATE.DONE;
    const result = {
      requestCount: this._requestCount,
      totalTokens: this._totalTokens,
      finalMessage,
    };
    this.emit("done", result);
    return result;
  }

  /**
   * Faz streaming SSE para a LLM e retorna a resposta completa.
   * Emite eventos 'chunk', 'tool_call_start', 'tool_call_end' durante o streaming.
   *
   * @param {Array} messages
   * @returns {Promise<{aiFullMessage: string, tokenCount: number, error?: string, rateLimited?: boolean, retryAfter?: number}>}
   * @private
   */
  async _streamLLM(messages) {
    const response = await fetch(`http://localhost:${this.port}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "x-hiperrouter-cli": "true"
      },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal: AbortSignal.timeout(600000) // 10 min safety timeout
    });

    if (response.status === 429) {
      const headerWait = parseInt(response.headers.get('retry-after') || '15', 10);
      return { aiFullMessage: "", tokenCount: 0, rateLimited: true, retryAfter: headerWait };
    }

    if (!response.ok) {
      return { aiFullMessage: "", tokenCount: 0, error: `API Error: ${response.status} ${response.statusText}` };
    }

    let aiFullMessage = "";
    let pendingPrint = "";
    let inToolCall = false;
    let tokenCount = 0;

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Process remaining buffer
          if (sseBuffer) {
            const lines = sseBuffer.split('\n');
            for (let line of lines) {
              line = line.trim();
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.substring(6));
                  if (data.usage && data.usage.total_tokens) {
                    tokenCount += data.usage.total_tokens;
                  }
                  const content = data.choices && data.choices[0] && data.choices[0].delta
                    ? (data.choices[0].delta.content || "") : "";
                  aiFullMessage += content;
                  pendingPrint += content;
                } catch (e) { /* ignore malformed */ }
              }
            }
          }
          break;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop(); // last incomplete line stays in buffer

        for (let line of lines) {
          line = line.trim();
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.error) {
                this.emit("chunk", `\n${COLORS.red}Erro Stream: ${data.error.message || JSON.stringify(data.error)}${COLORS.reset}\n`);
                aiFullMessage += `[ERRO: ${data.error.message || JSON.stringify(data.error)}]`;
                break;
              }
              const choice = data.choices && data.choices[0];
              if (!choice) continue;
              const content = choice.delta?.content || "";
              aiFullMessage += content;
              pendingPrint += content;

              // --- Streaming display with <tool_call> suppression ---
              while (pendingPrint.length > 0) {
                if (!inToolCall) {
                  let tagStart = pendingPrint.indexOf('<tool_call>');
                  let partialStart = -1;
                  for (let i = 1; i <= '<tool_call>'.length; i++) {
                    if (pendingPrint.endsWith('<tool_call>'.substring(0, i))) {
                      partialStart = pendingPrint.length - i;
                      break;
                    }
                  }
                  if (tagStart !== -1) {
                    this.emit("chunk", pendingPrint.substring(0, tagStart));
                    this.emit("tool_call_start");
                    inToolCall = true;
                    pendingPrint = pendingPrint.substring(tagStart + '<tool_call>'.length);
                  } else if (partialStart !== -1) {
                    this.emit("chunk", pendingPrint.substring(0, partialStart));
                    pendingPrint = pendingPrint.substring(partialStart);
                    break; // wait for more
                  } else {
                    this.emit("chunk", pendingPrint);
                    pendingPrint = "";
                  }
                } else {
                  let tagEnd = pendingPrint.indexOf('</tool_call>');
                  let partialEnd = -1;
                  for (let i = 1; i <= '</tool_call>'.length; i++) {
                    if (pendingPrint.endsWith('</tool_call>'.substring(0, i))) {
                      partialEnd = pendingPrint.length - i;
                      break;
                    }
                  }
                  if (tagEnd !== -1) {
                    inToolCall = false;
                    this.emit("tool_call_end");
                    pendingPrint = pendingPrint.substring(tagEnd + '</tool_call>'.length);
                  } else if (partialEnd !== -1) {
                    pendingPrint = pendingPrint.substring(partialEnd);
                    break;
                  } else {
                    pendingPrint = "";
                  }
                }
              }
            } catch (e) {
              if (process.env.DEBUG) console.warn(`[SSE] chunk parse error: ${e.message}`);
            }
          }
        }
      }

      // Flush remaining visible text
      if (pendingPrint.length > 0 && !inToolCall) {
        this.emit("chunk", pendingPrint);
      }
    }

    return { aiFullMessage, tokenCount };
  }

  /**
   * Self-Healing Bash Pass — executa blocos bash/sh que não foram
   * executados na primeira passagem (streaming), com flag selfHealing.
   *
   * @param {string} aiFullMessage
   * @param {Array} messages
   * @param {Set} executedCmds
   * @returns {Promise<{aiThinking: boolean}>}
   * @private
   */
  async _selfHealingBashPass(aiFullMessage, messages, executedCmds) {
    const bashMatches = [...aiFullMessage.matchAll(/```(?:bash|sh)\n([\s\S]*?)\n```/g)];

    for (const match of bashMatches) {
      const cmd = match[1].trim();
      if (executedCmds.has(cmd)) continue; // já executado no pass anterior

      const result = await runBashCommand(cmd, {
        confirmLabel: 'Executar o comando sugerido acima?',
        confirmFeedbackMsg: 'O usuário rejeitou o comando e disse',
        messages,
        aiFullMessage,
        pushAssistantFirst: false,
        feedbackToAI: false,
        selfHealing: true,
        confirmFn: this.confirmFn,
      });

      if (result.shouldBreak) {
        return { aiThinking: result.aiThinking };
      }
    }

    return { aiThinking: false };
  }
}

module.exports = { AgentRuntime, STATE };
