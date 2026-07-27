const { selectModelFromList } = require("./utils/modelSelector");
const { prompt, confirm, commandPalette, COLORS } = require("./utils/input");
const { showSuccess, showError, showEmptyState } = require("./utils/display");

const autoApprovedCommands = new Set();

function getActionPrefix(actionKey) {
  if (!actionKey) return "";
  if (actionKey.startsWith("patch:") || actionKey.startsWith("file:")) return actionKey;
  // Extrair as primeiras 3 palavras do comando para autorizar variações similares do mesmo comando
  return actionKey.trim().split(/\s+/).slice(0, 3).join(" ");
}

async function confirmWithAuto(question, actionKey) {
  const prefixKey = getActionPrefix(actionKey);
  if (autoApprovedCommands.has(actionKey) || autoApprovedCommands.has(prefixKey)) return true;
  while (true) {
    const answer = await prompt(`${question} (y/n/s/t): `);
    const lower = answer.toLowerCase();
    if (lower === "y" || lower === "yes" || lower === "sim") return true;
    if (lower === "n" || lower === "no" || lower === "nao" || lower === "não") return false;
    if (lower === "s" || lower === "sempre" || lower === "similar") {
      autoApprovedCommands.add(actionKey);
      if (prefixKey) autoApprovedCommands.add(prefixKey);
      return true;
    }
    if (lower === "t" || lower === "texto") {
      const txt = await prompt(`\x1b[36mDigite o feedback/texto para a IA:\x1b[0m `);
      return txt;
    }
    console.log("Responda 'y' (sim), 'n' (não), 's' (sempre) ou 't' (enviar texto/feedback).");
  }
}
const { clearScreen, renderDiffPreview } = require("./utils/display");
const api = require("./api/client");
const fs = require("fs");
const path = require("path");
const { execSync, spawn, spawnSync } = require("child_process");

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log(`\n\x1b[33mEncerrando CLI graciosamente (Ctrl+C)... Limpando processos pendentes.\x1b[0m`);
  process.exit(0);
});

// --- MILITARY GRADE SECURITY & RESILIENCE HELPERS ---

function sanitizePromptContext(text) {
  if (typeof text !== "string") return text;
  return text
    // Cloud provider keys
    .replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_OPENAI_KEY]")
    .replace(/\b(sk-ant-api[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_ANTHROPIC_KEY]")
    .replace(/\b(AKIA[0-9A-Z]{16})\b/g, "[REDACTED_AWS_KEY]")
    .replace(/\b(AIza[0-9A-Za-z_-]{35})\b/g, "[REDACTED_GCP_KEY]")
    // Git/CI tokens
    .replace(/\b(ghp_[a-zA-Z0-9]{30,})\b/g, "[REDACTED_GITHUB_KEY]")
    .replace(/\b(gho_[a-zA-Z0-9]{30,})\b/g, "[REDACTED_GITHUB_OAUTH]")
    .replace(/\b(ghs_[a-zA-Z0-9]{30,})\b/g, "[REDACTED_GITHUB_APP]")
    .replace(/\b(glpat-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_GITLAB_TOKEN]")
    .replace(/\b(glrt-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_GITLAB_RUNNER]")
    // Chat/messaging tokens
    .replace(/\b(xoxb-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_SLACK_BOT]")
    .replace(/\b(xoxp-[a-zA-Z0-9_-]{20,})\b/g, "[REDACTED_SLACK_USER]")
    .replace(/\b(bot[0-9]+:[a-zA-Z0-9_-]{30,})\b/g, "[REDACTED_TELEGRAM_BOT]")
    // Payment
    .replace(/\b(sk_live_[a-zA-Z0-9]{20,})\b/g, "[REDACTED_STRIPE_KEY]")
    .replace(/\b(rk_live_[a-zA-Z0-9]{20,})\b/g, "[REDACTED_STRIPE_KEY]")
    // JWT & auth
    .replace(/\b(eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED_JWT_TOKEN]")
    .replace(/(Bearer\s+)[a-zA-Z0-9._-]{20,}/gi, "$1[REDACTED_BEARER_TOKEN]")
    // Env vars with secrets
    .replace(/(DATABASE_URL|MYSQL_PASSWORD|POSTGRES_PASSWORD|REDIS_PASSWORD|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_TOKEN|AUTH_TOKEN|DISCORD_TOKEN)=["']?[^"'\s\n]{6,}["']?/gi, "$1=[REDACTED_SECRET]")
    // Private keys
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
}

const { logAudit, createGitCheckpoint, rollbackGitCheckpoint, processPatches, processNewFiles } = require("./chat/patchEngine");
const { showHelp, showAuditLogs } = require("./chat/commands");

const commandExecutionHistory = [];
function checkInfiniteLoopGuard(cmd) {
  const norm = cmd.trim().toLowerCase();
  commandExecutionHistory.push(norm);
  if (commandExecutionHistory.length > 50) commandExecutionHistory.shift(); // Previne memory leak
  const repeatCount = commandExecutionHistory.slice(-4).filter(c => c === norm).length;
  return repeatCount >= 3;
}

/**
 * Helper unificado de execução bash com confirmação do usuário.
 * Helper unificado de execução bash com confirmação do usuário.
 * Elimina triplicação de lógica nos blocos de Tool Call XML, Streaming e Post-response.
 *
 * @param {string} rawCmd - Comando original (sem rtk prefix)
 * @param {object} opts
 * @param {string}  opts.confirmLabel      - Texto do prompt de confirmação
 * @param {string}  opts.confirmFeedbackMsg- Mensagem quando usuário envia feedback em vez de y/n
 * @param {Array}   opts.messages          - Array de mensagens da conversa
 * @param {string}  opts.aiFullMessage     - Resposta completa da IA (para push de assistant)
 * @param {boolean} opts.pushAssistantFirst- Faz push do assistant ANTES de executar
 * @param {boolean} opts.feedbackToAI      - Envia resultado de volta para a IA continuar (aiThinking)
 * @param {boolean} opts.selfHealing       - Auto-cura: envia erro para a IA corrigir
 * @returns {{ aiThinking: boolean, shouldBreak: boolean }}
 */
async function runBashCommand(rawCmd, opts = {}) {
  const {
    confirmLabel = 'Executar o comando?',
    confirmFeedbackMsg = 'O usuário rejeitou o comando e disse',
    messages,
    aiFullMessage = '',
    pushAssistantFirst = false,
    feedbackToAI = false,
    selfHealing = false,
  } = opts;

  if (checkInfiniteLoopGuard(rawCmd)) {
    console.log(`\n${COLORS.red}🛑 [Infinite Loop Guard]: O comando '${rawCmd}' foi tentado 3x seguidas. Pausando auto-healing para segurança.${COLORS.reset}\n`);
    logAudit("LOOP_GUARD_TRIGGERED", { command: rawCmd });
    messages.push({ role: 'system', content: `[Infinite Loop Guard Interrompido]: O comando '${rawCmd}' falhou 3 vezes consecutivas. Peça ajuda ao usuário.` });
    return { aiThinking: false, shouldBreak: true };
  }

  // --- ANTI-BASH DESTRUCT GUARDRAIL ---
  // Bloqueia tentativas de usar shell cego para editar/apagar código-fonte diretamente
  const destRegex = /(sed\s+-i|awk\s|cat\s+<<|cat\s+.*?>|echo\s+.*?>|tee\s|rm\s+.*?\.)/i;
  const extRegex = /\.(ts|tsx|js|jsx|json|css|md|html)\b/i;
  
  if (destRegex.test(rawCmd) && extRegex.test(rawCmd) && !rawCmd.includes("scripts/")) {
    console.log(`\n${COLORS.red}🛑 [Anti-Bash Destruct]: Comando shell destrutivo bloqueado pelo Guardrail.${COLORS.reset}`);
    logAudit("BASH_DESTRUCT_BLOCKED", { command: rawCmd });
    messages.push({
      role: 'system',
      content: `[ACESSO BASH NEGADO]: Operação bloqueada pelo guardrail Anti-Destruição.\nVocê tentou usar shell scripting (sed, awk, redirecionamentos > ou rm) em arquivos de código fonte. O Bash é altamente destrutivo para arquivos TS/JS, pois frequentemente destrói aspas, indentação ou variáveis.\n\nREGRAS:\n1. Para editar código existente: USE EXCLUSIVAMENTE A TAG <patch path="..."></patch>.\n2. Para criar arquivos novos ou testar lógicas complexas: Crie um script Node.js na pasta temporária 'scripts/'.\n\nAbandone o Bash para esta tarefa, reavalie sua abordagem e tente novamente usando as ferramentas corretas.`
    });
    return { aiThinking: true, shouldBreak: true };
  }

  createGitCheckpoint();
  logAudit("COMMAND_EXECUTE", { command: rawCmd, approved: true });

  const shouldRun = await confirmWithAuto(
    `\n${COLORS.yellow}${confirmLabel}\n${COLORS.dim}${rawCmd}${COLORS.reset}`,
    rawCmd
  );

  if (typeof shouldRun === 'string') {
    messages.push({ role: 'assistant', content: aiFullMessage });
    messages.push({ role: 'user', content: `(${confirmFeedbackMsg}: "${shouldRun}")` });
    return { aiThinking: true, shouldBreak: true };
  }
  if (!shouldRun) return { aiThinking: false, shouldBreak: false };

  // Injetar prefixo rtk APENAS em comandos e fora de heredocs (evita corromper código)
  let inHereDoc = false;
  let hereDocMarker = "";
  
  const finalCmd = rawCmd.split('\n').map(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return line;
    
    // Fim do heredoc
    if (inHereDoc && t === hereDocMarker) {
      inHereDoc = false;
      return line;
    }
    // Dentro de heredoc
    if (inHereDoc) return line;

    // Início de heredoc
    const hereDocMatch = t.match(/<<\s*-?\s*['"]?([a-zA-Z0-9_-]+)['"]?/);
    if (hereDocMatch) {
      inHereDoc = true;
      hereDocMarker = hereDocMatch[1];
    }

    // Lista segura de comandos comuns (se não for um desses, confia no LLM)
    const knownCommands = /^(npm|npx|node|git|grep|cat|ls|rm|cd|pwd|cp|mv|sed|awk|curl|wget|docker|pm2|graphify|yarn|pnpm|bun|echo|mkdir|touch|chmod|chown|sudo|apt|apt-get|find|tar|unzip|zip)\b/;
    
    if (!t.startsWith('rtk ') && knownCommands.test(t)) {
      return line.replace(/^(\s*)/, '$1rtk ');
    }
    
    return line;
  }).join('\n');

  console.log(`\n${COLORS.green}Executando: \n${finalCmd}${COLORS.reset}`);
  if (pushAssistantFirst) messages.push({ role: 'assistant', content: aiFullMessage });

  try {
    const output = await new Promise((resolve, reject) => {
      const child = spawn(finalCmd, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
      let out = "";
      
      // Progress indicator para comandos lentos
      let timer = null;
      let ticks = 0;
      const progressChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
      timer = setInterval(() => {
        process.stdout.write(`\r\x1b[36mRodando comando... ${progressChars[ticks++ % progressChars.length]}\x1b[0m`);
      }, 100);

      if (child.stdout) {
        child.stdout.on('data', data => { out += data.toString(); });
      }
      if (child.stderr) {
        child.stderr.on('data', data => { out += data.toString(); });
      }

      child.on('close', code => {
        clearInterval(timer);
        process.stdout.write(`\r\x1b[K`); // Limpa a linha do spinner
        if (code === 0) resolve(out);
        else reject(new Error(out || `Process exited with code ${code}`));
      });
      child.on('error', err => {
        clearInterval(timer);
        process.stdout.write(`\r\x1b[K`);
        reject(err);
      });
    });

    const outputLines = output.split('\n');
    if (outputLines.length > 15) {
      console.log(outputLines.slice(0, 10).join('\n'));
      console.log(`\n${COLORS.dim}... [ + ${outputLines.length - 10} linhas ocultadas da tela. A IA leu tudo na íntegra. ] ...${COLORS.reset}`);
    } else {
      console.log(output);
    }

    // --- AUTO-VERIFICATION & ROLLBACK (God Mode Guardrail) ---
    if (selfHealing || feedbackToAI) {
      try {
        const gitStatus = require("child_process").execSync("git status --porcelain", { encoding: "utf8" });
        if (gitStatus.includes(".ts") || gitStatus.includes(".tsx")) {
          console.log(`\n${COLORS.cyan}🔍 [Auto-Guardrail] Alterações em TypeScript detectadas. Validando integridade...${COLORS.reset}`);
          try {
            // Tenta compilar os tsconfigs encontrados no nível 1 e 2
            let tsconfigs = [];
            try {
               const findRes = require("child_process").execSync("find . -maxdepth 2 -name 'tsconfig*.json' -not -path '*/node_modules/*'", { encoding: "utf8" });
               tsconfigs = findRes.trim().split('\\n').filter(Boolean);
            } catch (e) {}
            
            if (tsconfigs.length === 0 && fs.existsSync('tsconfig.json')) tsconfigs.push('tsconfig.json');
            
            for (const tsc of tsconfigs) {
               require("child_process").execSync(`npx tsc --noEmit --project ${tsc}`, { encoding: "utf8", stdio: 'pipe' });
            }
            console.log(`${COLORS.green}✅ [Auto-Guardrail] O código gerado pela IA está limpo e sem erros TypeScript!${COLORS.reset}`);
          } catch (tscErr) {
            const errStr = tscErr.stdout ? tscErr.stdout.toString() : tscErr.toString();
            console.log(`${COLORS.red}❌ [Auto-Guardrail] A IA gerou código com erro de TypeScript! Revertendo a ação...${COLORS.reset}`);
            
            rollbackGitCheckpoint();
            
            const errorContext = errStr.substring(0, 2000);
            messages.push({
              role: 'system',
              content: `⚠️ ALERTA DE SEGURANÇA: Seu último comando introduziu erros de tipagem/sintaxe. O guardrail REVERTEU a sua edição automaticamente.\n\nERRO DO COMPILADOR:\n\`\`\`\n${errorContext}\n\`\`\`\n\nPor favor, conserte a sua lógica (verifique imports faltando, uso de 'any', ou identação) e aplique a correção novamente. Lembre-se da política Zero ANY.`
            });
            return { aiThinking: true, shouldBreak: true };
          }
        }
      } catch (e) {
        // Ignora caso não seja repositório git ou outro erro menor
      }
    }

    if (feedbackToAI) {
      const sanitizedOut = sanitizePromptContext(output.substring(0, 50000));
      messages.push({ role: 'system', content: `Resultado:\n\`\`\`\n${sanitizedOut}\n\`\`\`\nContinue.` });
      return { aiThinking: true, shouldBreak: true };
    }
    console.log(`${COLORS.green}✅ Comando concluído.${COLORS.reset}\n`);
    return { aiThinking: false, shouldBreak: false };
  } catch (err) {
    const errorLog = sanitizePromptContext((err.message || err).toString());
    console.log(`${COLORS.red}Erro na execução:\n${errorLog}${COLORS.reset}\n`);
    if (selfHealing) {
      console.log(`${COLORS.dim}🧟‍♂️ [IA Self-Healing: Analisando o erro e gerando correção...]${COLORS.reset}`);
      messages.push({
        role: 'system',
        content: `O comando '${finalCmd}' falhou com este erro:\n\`\`\`\n${errorLog}\n\`\`\`\nAnalise o erro, corrija o que for necessário (criando um patch de código ou sugerindo um comando diferente) e tente resolver autonomamente.`
      });
    } else {
      messages.push({ role: 'system', content: `Erro:\n\`\`\`\n${errorLog}\n\`\`\`\nCorrija se necessário.` });
    }
    return { aiThinking: true, shouldBreak: true };
  }
}

function findUp(filename, startDir) {
  let currDir = startDir;
  while (true) {
    const filePath = path.join(currDir, filename);
    if (fs.existsSync(filePath)) return filePath;
    const parentDir = path.dirname(currDir);
    if (parentDir === currDir) return null; // root reached
    currDir = parentDir;
  }
}

function getProjectContext() {
  let context = "";
  try {
    const agentsPath = findUp("AGENTS.md", process.cwd());
    if (agentsPath) {
      context += "--- REGRAS GLOBAIS DE ENGENHARIA (AGENTS.md) ---\n" + fs.readFileSync(agentsPath, "utf-8") + "\n\n";
    }

    // graphify-out can be a folder containing GRAPH_REPORT.md
    const graphifyDir = findUp("graphify-out", process.cwd());
    if (graphifyDir) {
      const graphPath = path.join(graphifyDir, "GRAPH_REPORT.md");
      if (fs.existsSync(graphPath)) {
        const graphContent = fs.readFileSync(graphPath, "utf-8");
        context += "--- ARQUITETURA DO PROJETO (GRAPH_REPORT.md) ---\n";
        context += graphContent.length > 100000 ? graphContent.substring(0, 100000) + "\n...[TRUNCATED]" : graphContent;
      }
    }
  } catch (e) {}
  
  return context || "Nenhum contexto automático encontrado.";
}

function getHistoryFilePath() {
  const appDir = path.resolve(__dirname, "../../..", ".HiperRouter");
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  // Sanitize the current working directory path to create a unique filename per project
  const sanitizedPath = process.cwd().replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return path.join(appDir, `chat_history_${sanitizedPath}.json`);
}

async function startChatUI(port) {
  // Health check + version compatibility before starting chat
  try {
    const healthRes = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!healthRes.ok) {
      console.log(`${COLORS.yellow}⚠️  Servidor respondeu ${healthRes.status}. Algumas funcionalidades podem não funcionar.${COLORS.reset}\n`);
    } else {
      try {
        const health = await healthRes.json();
        if (health.version) {
          const cliPkg = require("../../../package.json");
          const cliMajor = cliPkg.version.split('.').slice(0, 2).join('.');
          const srvMajor = health.version.split('.').slice(0, 2).join('.');
          if (cliMajor !== srvMajor) {
            console.log(`${COLORS.yellow}⚠️  Versão do CLI (${cliPkg.version}) difere do servidor (${health.version}). Considere atualizar.${COLORS.reset}\n`);
          }
        }
      } catch {}
    }
  } catch {
    console.log(`${COLORS.red}❌ Servidor inacessível na porta ${port}. Inicie com: hiperrouter${COLORS.reset}\n`);
    return;
  }

  let model = await selectModelFromList("Select Model for Chat", "", { excludeCombos: false, port });
  if (!model) return;

  const keysResult = await api.getApiKeys();
  let keys = keysResult.success ? (keysResult.data.keys || []) : [];
  let apiKey = "no-key";

  // Usar a primeira chave disponível, ou criar uma automaticamente
  if (keys.length > 0) {
    apiKey = keys[0].key;
  } else {
    const createRes = await api.createApiKey("CLI Auto Key");
    if (createRes.success && createRes.data) {
      apiKey = createRes.data.key || "no-key";
    }
  }

  clearScreen();
  console.log(`\n💬 ${COLORS.bright}${COLORS.cyan}HiperRouter Agent (God Mode) 🚀${COLORS.reset} - Model: ${COLORS.dim}${model}${COLORS.reset}`);
  console.log(`${COLORS.dim}Comandos: /help para ver a lista completa com explicações detalhadas (/plan, /code, /commit, /read, /model, etc. - Use TAB para autocompletar)${COLORS.reset}\n`);

  const sessionStartTime = Date.now();
  let sessionRequestCount = 0;
  let sessionTotalTokens = 0;

  let messages = [];
  const historyFile = getHistoryFilePath();
  
  try {
    if (fs.existsSync(historyFile)) {
      const savedMessages = JSON.parse(fs.readFileSync(historyFile, "utf-8"));
      if (Array.isArray(savedMessages) && savedMessages.length > 0) {
        messages = savedMessages.filter(m => !(m.role === 'assistant' && (!m.content || !m.content.trim())));
        console.log(`${COLORS.dim}[Sessão anterior restaurada. Use /clear para reiniciar]${COLORS.reset}\n`);
      }
    }
  } catch (e) {}

  const projectContext = getProjectContext();

  // Rastrear mtime do grafo para recarregar contexto quando atualizar em disco
  let lastGraphMtime = 0;
  try {
    const graphifyDir = findUp('graphify-out', process.cwd());
    if (graphifyDir) {
      const gp = require('path').join(graphifyDir, 'GRAPH_REPORT.md');
      if (fs.existsSync(gp)) lastGraphMtime = fs.statSync(gp).mtimeMs;
    }
  } catch(e) {}
  let currentProjectContext = projectContext;

  // godModeRules é constante durante toda a sessão — process.cwd() nunca muda
  const godModeRules = `\nREGRAS CRÍTICAS DO SISTEMA (MODO DEUS):
1. TERMINAL: Qualquer sugestão de comando bash DEVE ser prefixada com 'rtk '. Seu CWD é ${process.cwd()}.
2. AUTO-DISCOVERY: Use <grep search="termo" /> sozinho se precisar buscar código. O sistema fará a busca.
3. WEB-SURFING: Para ler uma URL/doc na web, use <fetch url="https://..." /> sozinho. O sistema fará o download.
4. NUNCA ALUCINE BUGS: Você NÃO PODE inventar erros de código sem antes ler os arquivos REAIS usando o terminal (ex: \`\`\`bash\nrtk cat caminho/arquivo.js\n\`\`\`). Sempre valide se o bug existe antes de aplicar um patch.
5. SMART PATCH: Para editar um arquivo existente, NUNCA use bash (sed/echo/cat) nem reescreva o arquivo inteiro. Use estritamente este bloco de edição cirúrgica:
<patch path="caminho/arquivo.js">
<<<<
código antigo exato (incluindo espaços e quebras de linha exatas a serem removidas)
====
código novo (o que vai entrar no lugar)
>>>>
</patch>
6. AUTO-WRITE: Apenas para criar arquivos NOVOS DO ZERO, use <file path="caminho/arquivo.js">conteúdo completo</file>. NUNCA coloque blocos <<<< ==== >>>> dentro da tag <file>.
7. SCRIPTS TEMPORÁRIOS: Crie scripts temporários APENAS na pasta 'scripts/'. Nos blocos de comando bash, obrigatoriamente inclua a exclusão do script após o uso (ex: rtk node scripts/temp.js && rtk rm scripts/temp.js).
8. GRAPHIFY: Para consultar o grafo, NUNCA invente tags XML como <tool_call>. Use APENAS o terminal: \`\`\`bash\nrtk graphify query "sua pergunta"\n\`\`\`
9. ZERO XML INVENTADO: A interface final será exibida para humanos. É ESTRITAMENTE PROIBIDO gerar blocos <tool_call> ou <function>. Sempre que precisar do terminal, use blocos markdown puros (ex: \`\`\`bash\ncomando\n\`\`\`).`;

  while (true) {
    // Auto-recarregar contexto do grafo se o arquivo foi atualizado desde o início da sessão
    try {
      const graphifyDir = findUp('graphify-out', process.cwd());
      if (graphifyDir) {
        const gp = require('path').join(graphifyDir, 'GRAPH_REPORT.md');
        if (fs.existsSync(gp)) {
          const newMtime = fs.statSync(gp).mtimeMs;
          if (newMtime !== lastGraphMtime) {
            currentProjectContext = getProjectContext();
            lastGraphMtime = newMtime;
            console.log(`${COLORS.dim}[Contexto do projeto atualizado automaticamente]${COLORS.reset}`);
          }
        }
      }
    } catch(e) {}

    // Status bar: model | port | messages | uptime
    const uptimeMin = Math.round((Date.now() - sessionStartTime) / 60000);
    const statusLine = `${COLORS.dim}│ ${model} │ :${port} │ ${messages.length} msgs │ ${sessionRequestCount} reqs │ ${uptimeMin}m │${COLORS.reset}`;
    console.log(statusLine);

    let rawUserMessage = await prompt(`${COLORS.green}Você: ${COLORS.reset}`);
    let lowerMsg = rawUserMessage.toLowerCase().trim();

    // Ctrl+K → command palette
    if (rawUserMessage === "\x0B" || rawUserMessage === "\x0B") {
      const cmd = await commandPalette("HiperRouter Commands");
      if (cmd) {
        rawUserMessage = cmd;
        lowerMsg = cmd.toLowerCase().trim();
      } else {
        continue;
      }
    }
    
    if (lowerMsg === 'exit' || lowerMsg === 'quit' || lowerMsg === '/exit') break;
    if (lowerMsg === '/clear' || rawUserMessage === "\x0C") { // Ctrl+L or /clear
      messages = [];
      try { fs.unlinkSync(historyFile); } catch(e) {}
      clearScreen();
      console.log(`${COLORS.dim}Histórico do chat limpo.${COLORS.reset}\n`);
      continue;
    }
    if (lowerMsg === '/fav') {
      const configStore = require("./utils/configStore");
      const favs = configStore.getArray("favoriteModels");
      if (favs.includes(model)) {
        const newFavs = favs.filter(m => m !== model);
        configStore.set("favoriteModels", newFavs);
        console.log(`${COLORS.dim}✗ ${model} removido dos favoritos.${COLORS.reset}\n`);
      } else {
        configStore.appendToArray("favoriteModels", model, 20);
        console.log(`${COLORS.green}★ ${model} adicionado aos favoritos! Aparece no topo da lista /model.${COLORS.reset}\n`);
      }
      continue;
    }
    if (lowerMsg === '/palette' || lowerMsg === '/cmd') {
      const cmd = await commandPalette("HiperRouter Commands");
      if (cmd) {
        rawUserMessage = cmd;
        lowerMsg = cmd.toLowerCase().trim();
      } else {
        continue;
      }
    }
    if (lowerMsg.startsWith('/history')) {
      const n = parseInt(lowerMsg.split(' ')[1]) || 10;
      const recent = messages.filter(m => m.role !== 'system').slice(-n * 2);
      if (recent.length === 0) { console.log(`${COLORS.dim}Nenhuma mensagem no histórico.${COLORS.reset}\n`); }
      recent.forEach(m => {
        const isUser = m.role === 'user';
        const prefix = isUser ? `${COLORS.green}Você` : `${COLORS.cyan}IA`;
        const snippet = m.content.length > 400 ? m.content.substring(0, 400) + '…' : m.content;
        console.log(`\n${prefix}:${COLORS.reset} ${snippet}`);
      });
      console.log();
      continue;
    }
    if (lowerMsg === '/status') {
      try {
        const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
        console.log(res.ok
          ? `${COLORS.green}✅ Servidor UP (porta ${port}) — ${res.status}${COLORS.reset}\n`
          : `${COLORS.red}⚠️  Servidor respondeu ${res.status} na porta ${port}${COLORS.reset}\n`);
      } catch {
        console.log(`${COLORS.red}❌ Servidor inacessível na porta ${port}${COLORS.reset}\n`);
      }
      continue;
    }
    if (lowerMsg === '/undo') {
      // Encontra o .bak mais recente criado pelos patches desta sessão
      const baks = [];
      try {
        const findBaks = (dir, depth = 0) => {
          if (depth > 5) return;
          for (const f of fs.readdirSync(dir)) {
            const fp = path.join(dir, f);
            try {
              const st = fs.statSync(fp);
              if (st.isDirectory() && !f.startsWith('.') && f !== 'node_modules') findBaks(fp, depth + 1);
              else if (f.endsWith('.bak')) baks.push({ fp, mtime: st.mtimeMs });
            } catch(e) {}
          }
        };
        findBaks(process.cwd());
      } catch(e) {}
      if (baks.length === 0) {
        console.log(`${COLORS.dim}Nenhum arquivo .bak encontrado para restaurar.${COLORS.reset}\n`);
      } else {
        baks.sort((a, b) => b.mtime - a.mtime);
        const newest = baks[0].fp;
        const original = newest.replace(/\.bak$/, '');
        const { confirm } = require('./utils/input');
        const ok = await confirm(`\n${COLORS.yellow}Restaurar '${original}' a partir do backup '${newest}'?${COLORS.reset}`);
        if (ok) {
          fs.copyFileSync(newest, original);
          fs.unlinkSync(newest);
          console.log(`${COLORS.green}✅ Arquivo restaurado com sucesso.${COLORS.reset}\n`);
        }
      }
      continue;
    }
    if (lowerMsg.startsWith('/save')) {
      const arg = rawUserMessage.substring(5).trim();
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = arg || `chat-${dateStr}.md`;
      const fullSavePath = path.resolve(process.cwd(), filename);
      const lines = [`# Chat Session \u2014 ${new Date().toLocaleString('pt-BR')}\n\n`];
      const chatMessages = messages.filter(m => m.role !== 'system');
      if (chatMessages.length === 0) {
        console.log(`${COLORS.dim}Nenhuma mensagem na sess\u00e3o para salvar.${COLORS.reset}\n`);
      } else {
        chatMessages.forEach(m => {
          const header = m.role === 'user' ? '## \u{1F464} Voc\u00ea' : '## \u{1F916} IA';
          lines.push(`${header}\n\n${m.content}\n\n---\n\n`);
        });
        try {
          fs.writeFileSync(fullSavePath, lines.join(''));
          console.log(`${COLORS.green}\u2705 Conversa salva em '${filename}'${COLORS.reset}\n`);
        } catch(e) {
          console.log(`${COLORS.red}Erro ao salvar: ${e.message}${COLORS.reset}\n`);
        }
      }
      continue;
    }
    if (lowerMsg === '/copy') {
      const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
      if (!lastAiMsg) {
        console.log(`${COLORS.dim}Nenhuma resposta da IA no histórico para copiar.${COLORS.reset}\n`);
      } else {
        const { copyToClipboard } = require('./utils/clipboard');
        const ok = copyToClipboard(lastAiMsg.content);
        if (ok) console.log(`${COLORS.green}✅ Última resposta da IA copiada para a área de transferência!${COLORS.reset}\n`);
        else console.log(`${COLORS.red}Falha ao copiar para a área de transferência.${COLORS.reset}\n`);
      }
      continue;
    }
    if (lowerMsg === '/copy-code') {
      const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
      if (!lastAiMsg) {
        console.log(`${COLORS.dim}Nenhuma resposta da IA no histórico para copiar.${COLORS.reset}\n`);
      } else {
        const codeMatches = [...lastAiMsg.content.matchAll(/```(?:\w+)?\n([\s\S]*?)```/g)];
        if (codeMatches.length === 0) {
          console.log(`${COLORS.dim}Nenhum bloco de código encontrado na última resposta.${COLORS.reset}\n`);
        } else {
          const lastCode = codeMatches[codeMatches.length - 1][1].trim();
          const { copyToClipboard } = require('./utils/clipboard');
          const ok = copyToClipboard(lastCode);
          if (ok) console.log(`${COLORS.green}✅ Último bloco de código copiado para a área de transferência!${COLORS.reset}\n`);
          else console.log(`${COLORS.red}Falha ao copiar para a área de transferência.${COLORS.reset}\n`);
        }
      }
      continue;
    }
    if (lowerMsg === '/paste') {
      console.log(`\n${COLORS.cyan}📋 Modo Colar Multilinhas Ativado${COLORS.reset}`);
      console.log(`${COLORS.dim}Cole seu texto. Digite 'END' ou '---' em uma nova linha para enviar:${COLORS.reset}`);
      const pasteBuffer = [];
      while (true) {
        const line = await prompt(`${COLORS.dim}| ${COLORS.reset}`);
        if (line === 'END' || line === '---' || line === '/send') break;
        pasteBuffer.push(line);
      }
      rawUserMessage = pasteBuffer.join('\n').trim();
      if (!rawUserMessage) {
        console.log(`${COLORS.dim}Entrada vazia descartada.${COLORS.reset}\n`);
        continue;
      }
      lowerMsg = rawUserMessage.toLowerCase().trim();
      console.log(`${COLORS.dim}[Mensagem multilinhas capturada: ${pasteBuffer.length} linhas]${COLORS.reset}\n`);
    }
    let appendedContext = "";
    if (lowerMsg === '/paste-image' || lowerMsg.startsWith('/image') || lowerMsg === '/img') {
      const arg = rawUserMessage.replace(/^\/(?:paste-image|image|img)\s*/i, '').trim();
      const { getImageFromClipboard } = require('./utils/clipboard');
      let imgFile = null;

      if (arg && fs.existsSync(path.resolve(process.cwd(), arg))) {
        imgFile = path.resolve(process.cwd(), arg);
      } else {
        console.log(`${COLORS.dim}[Buscando imagem da área de transferência...]${COLORS.reset}`);
        imgFile = getImageFromClipboard();
      }

      if (imgFile && fs.existsSync(imgFile)) {
        const stats = fs.statSync(imgFile);
        const kb = (stats.size / 1024).toFixed(1);
        const b64 = fs.readFileSync(imgFile).toString('base64');
        const ext = path.extname(imgFile).substring(1) || 'png';
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
        
        appendedContext = `\n\n[IMAGEM ANEXADA PARA ANÁLISE VISUAL (${kb} KB)]:\ndata:${mimeType};base64,${b64}`;
        console.log(`${COLORS.green}🖼️  Imagem '${path.basename(imgFile)}' (${kb} KB) capturada e anexada para a IA!${COLORS.reset}`);
        
        if (rawUserMessage.startsWith('/')) {
          rawUserMessage = await prompt(`${COLORS.green}Sua pergunta sobre a imagem: ${COLORS.reset}`);
          lowerMsg = rawUserMessage.toLowerCase().trim();
        }
      } else {
        console.log(`${COLORS.red}⚠️ Nenhuma imagem encontrada na área de transferência ou no caminho especificado.${COLORS.reset}`);
        console.log(`${COLORS.dim}Dica: Copie uma imagem para o clipboard (Ctrl+C / PrintScreen) ou forneça um caminho: /image caminho/foto.png${COLORS.reset}\n`);
        continue;
      }
    }
    if (lowerMsg === '/rollback') {
      const ok = rollbackGitCheckpoint();
      if (ok) console.log(`${COLORS.green}✅ Rollback executado com sucesso! Estado do repositório restaurado.${COLORS.reset}\n`);
      else console.log(`${COLORS.red}Nenhum checkpoint anterior encontrado ou falha ao reverter.${COLORS.reset}\n`);
      continue;
    }
    if (lowerMsg.startsWith('/audit')) {
      const n = parseInt(lowerMsg.split(' ')[1]) || 15;
      showAuditLogs(n);
      continue;
    }
    if (lowerMsg === '/stats') {
      const elapsedSec = Math.round((Date.now() - sessionStartTime) / 1000);
      const min = Math.floor(elapsedSec / 60);
      const sec = elapsedSec % 60;
      console.log(`\n📊 ${COLORS.bright}Telemetria da Sessão (God Mode)${COLORS.reset}`);
      console.log(`  - ${COLORS.cyan}Modelo Ativo:${COLORS.reset} ${model}`);
      console.log(`  - ${COLORS.cyan}Requisições Realizadas:${COLORS.reset} ${sessionRequestCount}`);
      console.log(`  - ${COLORS.cyan}Tokens Est. Acumulados:${COLORS.reset} ${sessionTotalTokens.toLocaleString('pt-BR')}`);
      console.log(`  - ${COLORS.cyan}Tempo de Sessão:${COLORS.reset} ${min}m ${sec}s`);
      console.log(`  - ${COLORS.cyan}Audit Log:${COLORS.reset} .HiperRouter/audit.log\n`);
      continue;
    }
    if (lowerMsg === '/help' || lowerMsg === 'help') {
      showHelp();
      continue;
    }

    // appendedContext already declared before /paste-image block above
    const readMatch = rawUserMessage.match(/(?:^|\s)\/read\s+([^\s]+)/i);
    if (readMatch) {
      const filePath = readMatch[1];
      const fullPath = path.resolve(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        const fileContent = sanitizePromptContext(fs.readFileSync(fullPath, "utf-8"));
        appendedContext = `\n\n[CONTEÚDO LIDO DE '${filePath}']:\n\`\`\`\n${fileContent}\n\`\`\``;
        console.log(`${COLORS.dim}[Modo Read: Arquivo '${filePath}' injetado]${COLORS.reset}`);
        rawUserMessage = rawUserMessage.replace(readMatch[0], "").trim();
        lowerMsg = rawUserMessage.toLowerCase().trim();
      } else {
        console.log(`${COLORS.red}Aviso: Arquivo '${filePath}' não encontrado. Ignorando /read.${COLORS.reset}\n`);
        rawUserMessage = rawUserMessage.replace(readMatch[0], "").trim();
        lowerMsg = rawUserMessage.toLowerCase().trim();
      }
    }

    if (!rawUserMessage && !['/debug', '/commit', '/review'].includes(lowerMsg) && !appendedContext) continue;

    let systemPrompt = "Você é um assistente de IA prestativo.";
    let currentCommand = null;
    let finalUserMessage = rawUserMessage;
    
    if (lowerMsg.startsWith('/plan ')) {
      currentCommand = '/plan';
      systemPrompt = `Você é um Arquiteto de Software de Elite. Sua tarefa é criar um plano detalhado. Não escreva o código final.\n\nContexto do Projeto:\n${currentProjectContext}`;
      finalUserMessage = rawUserMessage.substring(6).trim();
      console.log(`${COLORS.dim}[Modo Planning Ativado]${COLORS.reset}`);
    } else if (lowerMsg.startsWith('/code ')) {
      currentCommand = '/code';
      systemPrompt = `Você é um Engenheiro de Software Sênior (Líder Técnico). Simule subagentes de Arquitetura e QA antes do código final. Escreva código seguro.\n\nContexto do Projeto:\n${currentProjectContext}`;
      finalUserMessage = rawUserMessage.substring(6).trim();
      console.log(`${COLORS.dim}[Modo Coding Ativado - Orquestrando subagentes...]${COLORS.reset}`);
    } else if (lowerMsg.startsWith('/test ')) {
      currentCommand = '/test';
      const filePath = rawUserMessage.substring(6).trim();
      const fullPath = path.resolve(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, "utf-8");
        systemPrompt = `Você é um Especialista em Testes (QA). Crie os testes unitários completos para o código fornecido usando o framework do projeto. Salve usando OBRIGATORIAMENTE a tag <file path="novoArquivo.test.js">.\n\nContexto do Projeto:\n${currentProjectContext}`;
        finalUserMessage = `Gere os testes para este arquivo (${filePath}):\n\`\`\`\n${fileContent}\n\`\`\``;
        console.log(`${COLORS.dim}[Modo Test Gen: Analisando '${filePath}'...]${COLORS.reset}`);
      } else {
        console.log(`${COLORS.red}Arquivo não encontrado para gerar testes: ${filePath}${COLORS.reset}\n`);
        continue;
      }
    } else if (lowerMsg === '/commit') {
      currentCommand = '/commit';
      let gitDiff = "";
      try { gitDiff = execSync("rtk git diff HEAD", { encoding: "utf8" }); } catch(e) {}
      if (!gitDiff.trim()) { console.log(`${COLORS.red}Nenhum diff encontrado.${COLORS.reset}\n`); continue; }
      systemPrompt = `Você é um Gerenciador de Versão Sênior. Retorne EXCLUSIVAMENTE um bloco JSON contendo a mensagem de commit semântica, sem explicações adicionais:\n\`\`\`json\n{"commitMessage": "tipo: descricao curta\\n\\ndetalhes"}\n\`\`\``;
      finalUserMessage = `Analise este diff:\n\`\`\`diff\n${gitDiff.substring(0, 50000)}\n\`\`\``;
      console.log(`${COLORS.dim}[Modo Auto-Commit - Analisando alterações...]${COLORS.reset}`);
    } else if (lowerMsg === '/review') {
      currentCommand = '/review';
      let gitDiff = "";
      try { gitDiff = execSync("rtk git diff HEAD", { encoding: "utf8" }); } catch(e) {}
      if (!gitDiff.trim()) { console.log(`${COLORS.red}Nenhum diff encontrado.${COLORS.reset}\n`); continue; }
      systemPrompt = `Você é um Subagente de Segurança e QA Sênior. Revise o git diff (uncommitted) buscando bugs críticos, erros de Zod, SSRF ou arquitetura frágil conforme as Regras Globais.\n\nContexto do Projeto:\n${currentProjectContext}`;
      finalUserMessage = `Revise este diff não commitado e recomende melhorias antes do commit:\n\`\`\`diff\n${gitDiff.substring(0, 50000)}\n\`\`\``;
      console.log(`${COLORS.dim}[Modo Review - Auditando seu código pendente...]${COLORS.reset}`);
    } else if (lowerMsg.startsWith('/skill ')) {
      currentCommand = '/skill';
      systemPrompt = `Você é um Especialista em IA. Crie a skill em um bloco JSON com 'skillName' e 'skillContent'.\nContexto do Projeto:\n${currentProjectContext}`;
      finalUserMessage = rawUserMessage.substring(7).trim();
      console.log(`${COLORS.dim}[Modo Skill Ativado]${COLORS.reset}`);
    } else if (lowerMsg === '/debug') {
      currentCommand = '/debug';
      systemPrompt = `Você é um Especialista em Debugging Sênior. Analise e corrija o erro com base no projeto.\n\nContexto do Projeto:\n${currentProjectContext}`;
      let errorLogs = "";
      try { errorLogs = execSync("rtk pm2 logs 9router --lines 50 --nostream --err", { encoding: "utf8" }); } catch(e) { errorLogs = "Erro ao buscar logs PM2."; }
      finalUserMessage = `Logs de erro PM2:\n\`\`\`\n${errorLogs}\n\`\`\`\n${rawUserMessage}`;
      console.log(`${COLORS.dim}[Modo Debug - Capturando PM2 logs...]${COLORS.reset}`);
    } else if (lowerMsg === '/model') {
      const newModel = await selectModelFromList("Trocar de Modelo", model, { excludeCombos: false, port });
      if (newModel && newModel !== model) {
        model = newModel;
        // Perguntar se quer manter o histórico com o novo modelo
        const { confirm } = require('./utils/input');
        const keepCtx = await confirm(`\n${COLORS.yellow}Manter histórico de conversa com o novo modelo?${COLORS.reset}`);
        if (!keepCtx) {
          messages = [];
          try { fs.unlinkSync(historyFile); } catch(e) {}
          console.log(`${COLORS.dim}[Contexto limpo para o novo modelo]${COLORS.reset}`);
        }
      }
      console.log(`\n💬 ${COLORS.bright}${COLORS.cyan}HiperRouter Agent (God Mode) 🚀${COLORS.reset} - Model: ${COLORS.dim}${model}${COLORS.reset}`);
      console.log(`${COLORS.dim}Comandos: /plan, /code, /test <arq>, /commit, /review, /skill, /debug, /read <arq>, /model, /web, /menu, /history [n], /status, /undo, /save [arq], /clear, /exit${COLORS.reset}\n`);
      continue;
    } else if (lowerMsg === '/menu') {
      const { startTerminalUI } = require("./terminalUI");
      await startTerminalUI(port);
      clearScreen();
      console.log(`\n💬 ${COLORS.bright}${COLORS.cyan}HiperRouter Agent (God Mode) 🚀${COLORS.reset} - Model: ${COLORS.dim}${model}${COLORS.reset}`);
      console.log(`${COLORS.dim}Comandos: /plan, /code, /test <arq>, /commit, /review, /skill, /debug, /read <arq>, /model, /web, /menu, /history [n], /status, /undo, /save [arq], /clear, /exit${COLORS.reset}\n`);
      continue;
    } else if (lowerMsg === '/web') {
      const { getEndpoint } = require("./utils/endpoint");
      const { openBrowser } = require("./utils/sysUtils");
      let serverUrl;
      try {
        const { endpoint, tunnelEnabled } = await getEndpoint(port);
        serverUrl = tunnelEnabled ? endpoint.replace(/\/v1$/, "") : `http://127.0.0.1:${port}`;
      } catch (e) {
        serverUrl = `http://127.0.0.1:${port}`;
      }
      console.log(`${COLORS.dim}Abrindo painel web em ${serverUrl}...${COLORS.reset}\n`);
      openBrowser(serverUrl);
      continue;
    } else if (['/plan', '/code', '/skill', '/test'].includes(lowerMsg)) {
      console.log(`${COLORS.red}Forneça instruções adicionais após o comando.${COLORS.reset}\n`); continue;
    } else if (messages.length === 0) {
      systemPrompt = `Você é um assistente de desenvolvimento prestativo.\n\nContexto do Projeto:\n${currentProjectContext}`;
    }

    const sysMsg = { role: "system", content: systemPrompt + godModeRules };
    
    if (messages.length > 0 && messages[0].role === "system") {
      if (currentCommand) messages[0] = sysMsg;
    } else {
      messages.unshift(sysMsg);
    }

    messages.push({ role: "user", content: finalUserMessage + appendedContext });

    const MAX_HISTORY = parseInt(process.env.HIPERROUTER_MAX_HISTORY || "20", 10);
    if (messages.length > MAX_HISTORY + 1) {
      messages = [messages[0], ...messages.slice(-MAX_HISTORY)];
    }

    let aiThinking = true;
    let rateLimitRetries = 0;
    const MAX_RATE_LIMIT_RETRIES = 3;
    while (aiThinking) {
      aiThinking = false;
      try {
        const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        let spinnerFrame = 0;
        const spinner = setInterval(() => {
          process.stdout.write(`\r${COLORS.cyan}IA: ${COLORS.reset}${frames[spinnerFrame++ % frames.length]} Pensando...`);
        }, 80);
        
        sessionRequestCount++;
        const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": `Bearer ${apiKey}`,
            "x-hiperrouter-cli": "true"
          },
          body: JSON.stringify({ model: model, messages: messages, stream: true }),
          signal: AbortSignal.timeout(300000) // 5 min safety timeout
        });

        clearInterval(spinner);
        // Clean up the spinner text but keep the "IA: " prefix
        process.stdout.write(`\r${COLORS.cyan}IA: ${COLORS.reset}\x1b[K`);

        if (response.status === 429) {
          rateLimitRetries++;
          if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
            console.log(`\n${COLORS.red}❌ Rate limit atingido ${MAX_RATE_LIMIT_RETRIES}x consecutivas. Troque de modelo com /model ou aguarde.${COLORS.reset}\n`);
            messages.pop();
            break;
          }
          const headerWait = parseInt(response.headers.get('retry-after') || '15', 10);
          const waitTime = Math.min(isNaN(headerWait) ? 15 : headerWait, 15);
          console.log(`\n${COLORS.yellow}⚠️  Rate limit (429) no modelo '${model}' — aguardando ${waitTime}s... (tentativa ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})${COLORS.reset}`);
          await new Promise(r => setTimeout(r, waitTime * 1000));
          // Pop the user message to avoid duplication on retry
          if (messages.length > 0 && messages[messages.length - 1].role === 'user') messages.pop();
          aiThinking = true;
          continue;
        }
        rateLimitRetries = 0; // reset on non-429 response
        if (!response.ok) {
          console.log(`${COLORS.red}Erro API: ${response.status} ${response.statusText}${COLORS.reset}`);
          messages.pop(); break;
        }

        let aiFullMessage = "";
        let pendingPrint = "";
        let inToolCall = false;
        
        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let sseBuffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              if (sseBuffer) {
                // process remaining buffer just in case
                const lines = sseBuffer.split('\n');
                for (let line of lines) {
                  line = line.trim();
                  if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                      const data = JSON.parse(line.substring(6));
                      if (data.usage && data.usage.total_tokens) {
                        sessionTotalTokens += data.usage.total_tokens;
                      }
                      const content = data.choices && data.choices[0] && data.choices[0].delta ? (data.choices[0].delta.content || "") : "";
                      aiFullMessage += content;
                      pendingPrint += content;
                    } catch(e) {}
                  }
                }
              }
              break;
            }
            
            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop(); // keep the last incomplete line in the buffer
            
            for (let line of lines) {
              line = line.trim();
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.substring(6));
                  if (data.error) {
                    process.stdout.write(`\n${COLORS.red}Erro Stream: ${data.error.message || JSON.stringify(data.error)}${COLORS.reset}\n`);
                    aiFullMessage += `[ERRO: ${data.error.message || JSON.stringify(data.error)}]`;
                    break;
                  }
                  const choice = data.choices && data.choices[0];
                  if (!choice) continue; // skip malformed chunks (usage-only, etc.)
                  const content = choice.delta?.content || "";
                  aiFullMessage += content;
                  pendingPrint += content;

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
                        process.stdout.write(pendingPrint.substring(0, tagStart));
                        process.stdout.write(`\n${COLORS.cyan}🛠️  Preparando ação (Tool Call)...${COLORS.reset}\n`);
                        inToolCall = true;
                        pendingPrint = pendingPrint.substring(tagStart + '<tool_call>'.length);
                      } else if (partialStart !== -1) {
                        process.stdout.write(pendingPrint.substring(0, partialStart));
                        pendingPrint = pendingPrint.substring(partialStart);
                        break; // wait for more
                      } else {
                        process.stdout.write(pendingPrint);
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
          if (pendingPrint.length > 0 && !inToolCall) {
            process.stdout.write(pendingPrint);
          }
        }

        // --- XML Tool Call Fallback (Suporte flexível para function name="") ---
        const xmlToolMatches = [...aiFullMessage.matchAll(/<tool_call>[\s\S]*?<function[\s=]+(?:name=)?"?([^>"]+)"?>([\s\S]*?)<\/function>[\s\S]*?<\/tool_call>/g)];
        for (const match of xmlToolMatches) {
          const funcName = match[1].trim();
          const paramsBlock = match[2];
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
            const result = await runBashCommand(cmd, {
              confirmLabel: `Permitir Tool Call (${funcName})?`,
              confirmFeedbackMsg: 'O usuário abortou a execução e enviou este feedback',
              messages, aiFullMessage,
              pushAssistantFirst: true,
              feedbackToAI: true,
            });
            if (result.shouldBreak) { aiThinking = result.aiThinking; break; }
          } else {
            // Se a função for desconhecida, avisa o modelo para tentar de novo com bash!
            console.log(`\n${COLORS.red}⚠️ IA tentou usar ferramenta inexistente: ${funcName}${COLORS.reset}`);
            messages.push({ role: "assistant", content: aiFullMessage });
            messages.push({ role: "system", content: `Erro: A função '${funcName}' não existe no God Mode. Você DEVE usar um bloco markdown \`\`\`bash\`\`\` para rodar comandos como 'rtk cat', 'rtk sed', etc.` });
            aiThinking = true; break;
          }
        }

        // --- Markdown Bash Fallback (God Mode System Prompt compliance) ---
        // Track executed commands to prevent duplicate execution in post-response pass
        const executedBashCmds = new Set();
        if (!aiThinking) {
          const bashMatches = [...aiFullMessage.matchAll(/```bash\n([\s\S]*?)```/g)];
          for (const match of bashMatches) {
            const cmd = match[1].trim();
            if (cmd && !aiFullMessage.includes('<tool_call>')) {
              executedBashCmds.add(cmd);
              const result = await runBashCommand(cmd, {
              confirmLabel: 'Permitir Execução de Bash?',
              confirmFeedbackMsg: 'O usuário abortou a execução e enviou este feedback',
              messages, aiFullMessage,
              pushAssistantFirst: true,
              feedbackToAI: true,
            });
            if (result.shouldBreak) { aiThinking = result.aiThinking; break; }
            }
          }
        }

        console.log("\n");
        // Somente faz push se não tivermos feito push dentro da execução (aiThinking == false)
        if (!aiThinking && aiFullMessage && aiFullMessage.trim().length > 0) {
          messages.push({ role: "assistant", content: aiFullMessage });
        }
        try {
          // Compactar mensagens system com output longo antes de salvar (evita arquivos de MB)
          // Preserva início (instruções) e fim (erros/recentes) do conteúdo
          const compactMessages = messages.map(m => {
            if (m.role !== 'system' || m.content.length <= 2000) return m;
            const head = m.content.substring(0, 500);
            const tail = m.content.substring(m.content.length - 500);
            return { ...m, content: `${head}\n…[COMPACTADO ${m.content.length}→1000 chars — conteúdo completo processado pela IA]…\n${tail}` };
          });
          fs.writeFileSync(historyFile, JSON.stringify(compactMessages, null, 2));
        } catch(e) { if (process.env.DEBUG) console.warn("[history] save failed:", e.message); }

        // --- Autonomous Loop: Auto-Discovery (Grep) ---
        const grepMatch = aiFullMessage.match(/<grep\s+search="([^"]+)"\s*\/>/);
        if (grepMatch) {
          const term = grepMatch[1];
          console.log(`\n${COLORS.dim}🔍 [IA Auto-Discovery: Buscando internamente por '${term}'...]${COLORS.reset}`);
          let grepResult = "";
          try {
            // JSON.stringify escapa o termo para evitar shell injection vindo da IA
            grepResult = execSync(`rtk git grep -in -- ${JSON.stringify(term)} | head -n 30`, { encoding: "utf8" });
          } catch(e) { grepResult = "(Nenhum resultado encontrado)"; }
          
          messages.push({ role: "system", content: `Resultado da busca interna para '${term}':\n\`\`\`\n${grepResult || 'Nada encontrado.'}\n\`\`\`\nContinue seu raciocínio.` });
          aiThinking = true; continue; 
        }

        // --- Autonomous Loop: Web Surfing (Fetch) ---
        const fetchMatch = aiFullMessage.match(/<fetch\s+url="([^"]+)"\s*\/>/);
        if (fetchMatch) {
          const targetUrl = fetchMatch[1];
          console.log(`\n${COLORS.dim}🌐 [IA Web Surfing: Lendo conteúdo de '${targetUrl}'...]${COLORS.reset}`);
          let webContent = "";
          try {
            const res = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
            const html = await res.text();
            webContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 15000);
          } catch(e) { webContent = e.name === 'TimeoutError' ? `Timeout: URL não respondeu em 10s.` : "Falha ao acessar URL."; }
          
          messages.push({ role: "system", content: `Conteúdo lido da URL '${targetUrl}':\n\`\`\`\n${webContent}\n\`\`\`\nContinue seu raciocínio baseando-se nestes dados.` });
          aiThinking = true; continue;
        }

        // --- Git Auto-Commit ---
        if (currentCommand === '/commit') {
          const jsonMatch = aiFullMessage.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            try {
              const commitData = JSON.parse(jsonMatch[1]);
              if (commitData.commitMessage) {
                const shouldCommit = await confirm(`\n${COLORS.yellow}Confirmar e realizar o commit com esta mensagem?\n"${commitData.commitMessage}"${COLORS.reset}`);
                if (shouldCommit) {
                  spawnSync('git', ['add', '.'], { stdio: 'inherit' });
                  spawnSync('git', ['commit', '-m', commitData.commitMessage], { stdio: 'inherit' });
                  console.log(`${COLORS.green}✅ Commit realizado!${COLORS.reset}\n`);
                }
              }
            } catch(e) {}
          }
        }

        // --- Smart Patch & New Files ---
        if (!aiThinking) {
          const patchRes = await processPatches(aiFullMessage, messages);
          if (patchRes.aiThinking) { aiThinking = true; break; }
        }
        if (!aiThinking) {
          const fileRes = await processNewFiles(aiFullMessage, messages);
          if (fileRes.aiThinking) { aiThinking = true; break; }
        }

        // --- Auto-Run Bash com SELF-HEALING ---
        // Skip commands already executed in the streaming pass to prevent duplicates
        const bashMatchesSH = [...aiFullMessage.matchAll(/```(?:bash|sh)\n([\s\S]*?)\n```/g)];
        for (const match of bashMatchesSH) {
          const cmd = match[1].trim();
          if (executedBashCmds.has(cmd)) continue; // already ran in streaming pass
          const result = await runBashCommand(cmd, {
            confirmLabel: 'Executar o comando sugerido acima?',
            confirmFeedbackMsg: 'O usuário rejeitou o comando e disse',
            messages, aiFullMessage,
            pushAssistantFirst: false,
            feedbackToAI: false,
            selfHealing: true,
          });
          if (result.shouldBreak) { aiThinking = result.aiThinking; break; }
        }

        // --- Skill Auto-Creation ---
        if (currentCommand === '/skill') {
          const jsonMatch = aiFullMessage.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            try {
              const skillData = JSON.parse(jsonMatch[1]);
              if (skillData.skillName && skillData.skillContent) {
                const skillsDir = path.resolve(__dirname, "../../..", "skills", skillData.skillName);
                if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
                fs.writeFileSync(path.join(skillsDir, "SKILL.md"), skillData.skillContent);
                console.log(`${COLORS.green}✅ Skill '${skillData.skillName}' criada!${COLORS.reset}\n`);
              }
            } catch (e) {}
          }
        }

      } catch (err) {
        console.log(`\n${COLORS.red}Falha na comunicação: ${err.message}${COLORS.reset}`);
        messages.pop();
        aiThinking = false;
      }
    } // fim do while(aiThinking)
  }
}

module.exports = { startChatUI };
