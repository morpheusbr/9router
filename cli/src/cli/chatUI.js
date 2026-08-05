const { selectModelFromList } = require("./utils/modelSelector");
const { prompt, confirm, commandPalette, COLORS } = require("./utils/input");
const { showSuccess, showError, showEmptyState } = require("./utils/display");

// --- Agent Runtime Architecture ---
const { AgentRuntime } = require("./agent/agentRuntime");
const { createDefaultRegistry } = require("./agent/toolRegistry");
const { sanitizePromptContext } = require("./agent/sanitize");
const { compressHistory } = require("./agent/memoryEngine");
const { orchestrateCodeSubagents } = require("./agent/subagentOrchestrator");

const { confirmWithAuto, findUp, getProjectContext, getHistoryFilePath } = require("./utils/chatHelpers");
const { clearScreen, renderDiffPreview } = require("./utils/display");
const api = require("./api/client");
const fs = require("fs");
const path = require("path");
const { execSync, spawn, spawnSync } = require("child_process");
const { logAudit, createGitCheckpoint, rollbackGitCheckpoint, processPatches, processNewFiles } = require("./chat/patchEngine");
const { showHelp, showAuditLogs } = require("./chat/commands");
const { renderMarkdown } = require("./utils/display");

/**
 * Estimativa simples de tokens (chars / 4 ≈ tokens para modelos OpenAI/Claude).
 * Não é preciso, mas suficiente para gerenciar contexto.
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Conta tokens estimados em todo o array de mensagens.
 */
function estimateMessagesTokens(messages) {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content) + 4; // overhead por mensagem
  }
  return total;
}

/**
 * Limites de contexto por categoria de modelo.
 */
const CONTEXT_LIMITS = {
  small: 8192,     // gpt-3.5, claude-instant
  medium: 32768,   // gpt-4-turbo, claude-3-haiku
  large: 131072,   // gpt-4o, claude-3.5-sonnet
  xlarge: 1048576, // gemini-1.5-pro, claude-3-opus
};

function getContextLimit(modelName) {
  const m = (modelName || '').toLowerCase();
  if (m.includes('gemini') || m.includes('opus') || m.includes('128k') || m.includes('200k')) return CONTEXT_LIMITS.xlarge;
  if (m.includes('gpt-4o') || m.includes('sonnet') || m.includes('claude-3.5') || m.includes('128k')) return CONTEXT_LIMITS.large;
  if (m.includes('gpt-4') || m.includes('haiku') || m.includes('32k')) return CONTEXT_LIMITS.medium;
  return CONTEXT_LIMITS.medium; // default seguro
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
  if (!model) {
    // Retorna um valor específico para indicar que a seleção falhou/foi cancelada
    return false;
  }

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
  let lastGitCheckpoint = null;
  let lastCtrlCTime = 0;

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

  // godModeRules modularizado — core sempre presente, extras por comando
  const RULES_CORE = `\nREGRAS CRÍTICAS DO SISTEMA:
1. TERMINAL: Comandos bash DEVE ser prefixados com 'rtk '. CWD: ${process.cwd()}.
2. NUNCA PEÇA PARA O USUÁRIO COLAR CÓDIGO: Use o terminal (rtk cat) para ler arquivos.
3. NUNCA ALUCINE BUGS: Valide se o bug existe lendo os arquivos REAIS antes de propor patches.
4. ZERO XML INVENTADO: É PROIBIDO gerar blocos <tool_call> ou <function>. Use markdown puro.
5. PROATIVIDADE EXTREMA: Nunca responda apenas com perguntas. Explore o código com o terminal.
6. PROVA DE TRABALHO: Antes de propor arquitetura, leia o estado atual com rtk cat/grep.
7. ZERO INTERROGATÓRIO: Descubra TUDO executando comandos bash. Nunca pergunte sobre o código.`;

  const RULES_CODE_EDIT = `
8. SMART PATCH: Para editar arquivo existente, use:
   <patch path="caminho/arquivo.js">
   <<<<
   código antigo exato
   ====
   código novo
   >>>>
   </patch>
9. AUTO-WRITE: Apenas para arquivos NOVOS: <file path="...">conteúdo</file>. Sem <<<< ==== >>>> dentro.
10. SCRIPTS TEMPORÁRIOS: Apenas na pasta 'scripts/'. Inclua exclusão após uso.
11. AUTO-DISCOVERY: Use <grep search="termo" /> para buscar código.
12. WEB-SURFING: Use <fetch url="https://..." /> para ler docs na web.
13. GRAPHIFY: Consulte o grafo com: rtk graphify query "pergunta".`;

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

    // Modern Status bar & Rounded Input Box with dynamic ANSI-stripped padding alignment
    const uptimeMin = Math.round((Date.now() - sessionStartTime) / 60000);
    const activePersona = require("./utils/configStore").get("activePersona") || "god";
    const activeLang = require("./utils/locale").getActiveLanguage();
    const estimatedTokens = estimateMessagesTokens(messages);
    const contextLimit = getContextLimit(model);
    const contextPct = Math.min(99, Math.round((estimatedTokens / contextLimit) * 100));
    const contextColor = contextPct > 80 ? COLORS.red : contextPct > 50 ? COLORS.yellow : COLORS.green;
    const compactMode = require("./utils/configStore").get("compactMode", false);

    if (compactMode) {
      // Compact status bar - single line
      console.log(`${COLORS.dim}${model} │ ${activePersona.toUpperCase()} │ ${messages.length}msg │ ${contextColor}~${contextPct}%${COLORS.reset} │ ${uptimeMin}m`);
    } else {
      const rawStatus = ` 🤖 Model: ${model} │ ⚡ Persona: ${activePersona.toUpperCase()} │ 🌐 Lang: ${activeLang} │ 📡 Port: :${port} │ 💬 Msgs: ${messages.length} │ 🧠 Ctx: ~${contextPct}% │ ⏱️ Uptime: ${uptimeMin}m `;
      const boxWidth = Math.max(78, rawStatus.length + 4);
      const innerWidth = boxWidth - 2;
      const paddingRight = Math.max(0, innerWidth - rawStatus.length);
      const coloredStatus = ` 🤖 Model: ${COLORS.cyan}${model}${COLORS.reset} │ ⚡ Persona: ${COLORS.green}${activePersona.toUpperCase()}${COLORS.reset} │ 🌐 Lang: ${COLORS.cyan}${activeLang}${COLORS.reset} │ 📡 Port: ${COLORS.yellow}:${port}${COLORS.reset} │ 💬 Msgs: ${messages.length} │ 🧠 Ctx: ${contextColor}~${contextPct}%${COLORS.reset} │ ⏱️ Uptime: ${uptimeMin}m ${" ".repeat(paddingRight)}`;

      if (contextPct > 80) {
        console.log(`${COLORS.yellow}⚠️  Contexto em ~${contextPct}% (${estimatedTokens.toLocaleString()} tokens). Use /clear para liberar espaço.${COLORS.reset}`);
      }
      console.log(`\n${COLORS.cyan}╭${"─".repeat(innerWidth)}╮${COLORS.reset}`);
      console.log(`${COLORS.cyan}│${COLORS.reset}${coloredStatus}${COLORS.cyan}│${COLORS.reset}`);
      console.log(`${COLORS.cyan}╰${"─".repeat(innerWidth)}╯${COLORS.reset}`);
    }

    const promptTitle = "─[ Prompt ]";
    const promptHeaderPad = Math.max(0, innerWidth - promptTitle.length);
    const promptLabel = `${COLORS.bright}${COLORS.green}╭${promptTitle}${"─".repeat(promptHeaderPad)}╮\n│ 💬 ${COLORS.reset}`;
    
    let rawUserMessage = "";
    try {
      rawUserMessage = await prompt(promptLabel);
      lastCtrlCTime = 0; // Reseta o contador ao digitar com sucesso
    } catch (e) {
      // Captura Ctrl+C no prompt
      const now = Date.now();
      if (now - lastCtrlCTime < 3000) {
        console.log(`\n${COLORS.red}🚪 Encerrando sessão do HiperRouter Agent...${COLORS.reset}\n`);
        break;
      } else {
        lastCtrlCTime = now;
        console.log(`\n${COLORS.yellow}⚠️  Pressione Ctrl+C novamente para sair da sessão do chat.${COLORS.reset}\n`);
        continue;
      }
    }
    console.log(`${COLORS.green}╰${"─".repeat(innerWidth)}╯${COLORS.reset}\n`);
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
    const { handleSlashCommand } = require("./chat/commands");
    const state = { port, messages, model, sessionStartTime, sessionRequestCount, sessionTotalTokens, historyFile };
    const handled = await handleSlashCommand(lowerMsg, rawUserMessage, state);
    
    // update mutable state
    lowerMsg = state.lowerMsg || lowerMsg;
    if (state.messages.length === 0) messages = []; // cleared

    if (handled) {
      if (lowerMsg === '/clear') messages = [];
      continue;
    }

    // Still need to handle /read (with wildcard support) and /model (interactive) in chatUI 
    // because they deeply interact with chatUI local state (appendedContext, newModel confirm, etc).
    
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
        const MAX_IMG_SIZE = 5 * 1024 * 1024; // 5MB
        if (stats.size > MAX_IMG_SIZE) {
          console.log(`${COLORS.red}⚠️ Imagem '${path.basename(imgFile)}' tem ${(stats.size/1024/1024).toFixed(1)}MB (limite: 5MB). Redimensione antes de anexar.${COLORS.reset}\n`);
          continue;
        }
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

    const readMatch = rawUserMessage.match(/(?:^|\s)\/read\s+([^\s]+)/i);
    if (readMatch) {
      const { readFilesByWildcard } = require("./chat/wildcard");
      const pattern = readMatch[1];
      const filesToRead = pattern.includes('*') ? readFilesByWildcard(pattern) : [path.resolve(process.cwd(), pattern)];
      
      let allContent = "";
      for (const fullPath of filesToRead) {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
           const fileSize = fs.statSync(fullPath).size;
           if (fileSize > 102400) {
             console.log(`${COLORS.yellow}⚠️ Arquivo '${path.basename(fullPath)}' tem ${(fileSize/1024).toFixed(0)}KB (limite: 100KB). Truncando...${COLORS.reset}`);
           }
           const rawContent = fs.readFileSync(fullPath, "utf-8");
           const fileContent = sanitizePromptContext(rawContent.substring(0, 102400));
           const truncNotice = rawContent.length > 102400 ? `\n...[TRUNCADO de ${rawContent.length} para 102400 caracteres]` : '';
           allContent += `\n\n[CONTEÚDO LIDO DE '${path.basename(fullPath)}']:\n\`\`\`\n${fileContent}${truncNotice}\n\`\`\``;
           console.log(`${COLORS.dim}[Modo Read: Arquivo '${path.basename(fullPath)}' (${(fileSize/1024).toFixed(1)}KB) injetado]${COLORS.reset}`);
        } else if (!pattern.includes('*')) {
           console.log(`${COLORS.red}Aviso: Arquivo '${pattern}' não encontrado. Ignorando /read.${COLORS.reset}\n`);
        }
      }
      appendedContext += allContent;
      rawUserMessage = rawUserMessage.replace(readMatch[0], "").trim();
      lowerMsg = rawUserMessage.toLowerCase().trim();
    }

    if (!rawUserMessage && !['/debug', '/commit', '/review'].includes(lowerMsg) && !appendedContext) continue;

    let systemPrompt = "Você é um Engenheiro de Software Autônomo e Executor de Terminal. Sua única interface com o mundo é através do terminal. VOCÊ DEVE agir sozinho. Nunca peça favores ao usuário nem espere que ele forneça arquivos. Explore o projeto com 'rtk cat', 'rtk ls', e 'rtk grep' por conta própria.";
    let currentCommand = null;
    let finalUserMessage = rawUserMessage;
    
    if (lowerMsg.startsWith('/plan ')) {
      currentCommand = '/plan';
      systemPrompt = `Você é um Arquiteto de Software de Elite. Sua tarefa é criar um plano detalhado. Não escreva o código final.\n\nContexto do Projeto:\n${currentProjectContext}`;
      finalUserMessage = rawUserMessage.substring(6).trim();
      console.log(`${COLORS.dim}[Modo Planning Ativado]${COLORS.reset}`);
    } else if (lowerMsg.startsWith('/code ')) {
      currentCommand = '/code';
      systemPrompt = `Você é o Engenheiro de Software Sênior (Líder Técnico) e executor final. Seu objetivo é concretizar o plano validado e testado pelas equipes anteriores.\n\nContexto do Projeto:\n${currentProjectContext}`;
      console.log(`${COLORS.dim}[Modo Coding Ativado - Iniciando Orquestração de Subagentes]${COLORS.reset}`);
      finalUserMessage = await orchestrateCodeSubagents(rawUserMessage.substring(6).trim(), currentProjectContext, { port, apiKey, model });
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

      // Show colored diff summary
      const diffLines = gitDiff.split('\n');
      const stats = { added: 0, removed: 0, files: new Set() };
      for (const line of diffLines) {
        if (line.startsWith('+') && !line.startsWith('+++')) stats.added++;
        if (line.startsWith('-') && !line.startsWith('---')) stats.removed++;
        if (line.startsWith('diff --git')) {
          const match = line.match(/b\/(.+)$/);
          if (match) stats.files.add(match[1]);
        }
      }
      console.log(`\n${COLORS.cyan}📋 Diff: ${stats.files.size} arquivo(s) | ${COLORS.green}+${stats.added} ${COLORS.red}-${stats.removed}${COLORS.reset}`);
      // Show colored diff preview (first 30 lines)
      const preview = diffLines.slice(0, 30);
      for (const line of preview) {
        if (line.startsWith('+') && !line.startsWith('+++')) console.log(`${COLORS.green}${line}${COLORS.reset}`);
        else if (line.startsWith('-') && !line.startsWith('---')) console.log(`${COLORS.red}${line}${COLORS.reset}`);
        else if (line.startsWith('@@')) console.log(`${COLORS.cyan}${line}${COLORS.reset}`);
        else console.log(`${COLORS.dim}${line}${COLORS.reset}`);
      }
      if (diffLines.length > 30) console.log(`${COLORS.dim}... +${diffLines.length - 30} linhas${COLORS.reset}`);
      console.log();

      systemPrompt = `Você é um Subagente de Segurança e QA Sênior. Revise o git diff (uncommitted) buscando bugs críticos, erros de Zod, SSRF ou arquitetura frágil conforme as Regras Globais.\n\nContexto do Projeto:\n${currentProjectContext}`;
      finalUserMessage = `Revise este diff não commitado e recomende melhorias antes do commit:\n\`\`\`diff\n${gitDiff.substring(0, 50000)}\n\`\`\``;
      console.log(`${COLORS.dim}[Modo Review - Auditando seu código pendente...]${COLORS.reset}`);
    } else if (lowerMsg.startsWith('/skill ')) {
      currentCommand = '/skill';
      systemPrompt = `Você é um Especialista em IA. Crie a skill em um bloco JSON com 'skillName' e 'skillContent'.`;
      finalUserMessage = rawUserMessage.substring(7).trim();
      console.log(`${COLORS.dim}[Modo Skill Ativado]${COLORS.reset}`);
    } else if (lowerMsg === '/debug') {
      currentCommand = '/debug';
      systemPrompt = `Você é um Especialista em Debugging Sênior. Analise e corrija o erro com base no projeto.\n\nContexto do Projeto:\n${currentProjectContext}`;
      let errorLogs = "";
      try { errorLogs = execSync("rtk pm2 logs hiperrouter --lines 50 --nostream --err", { encoding: "utf8" }); } catch(e) { errorLogs = "Erro ao buscar logs PM2."; }
      finalUserMessage = `Logs de erro PM2:\n\`\`\`\n${errorLogs}\n\`\`\`\n${rawUserMessage}`;
      console.log(`${COLORS.dim}[Modo Debug - Capturando PM2 logs...]${COLORS.reset}`);
    } else if (lowerMsg.startsWith('/explain ')) {
      currentCommand = '/explain';
      const filePath = rawUserMessage.substring(9).trim();
      const fullPath = path.resolve(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        const fileSize = fs.statSync(fullPath).size;
        if (fileSize > 102400) {
          console.log(`${COLORS.yellow}⚠️ Arquivo muito grande (${(fileSize/1024).toFixed(0)}KB). Lendo primeiras 100KB...${COLORS.reset}`);
        }
        const fileContent = fs.readFileSync(fullPath, "utf-8").substring(0, 102400);
        systemPrompt = `Você é um Especialista em Documentação Técnica. Sua tarefa é explicar o código fornecido de forma clara e concisa.
- Explique a propósito e responsabilidades do arquivo
- Liste as principais funções/classes e o que fazem
- Identifique padrões de design usados
- Aponte possíveis problemas ou pontos de atenção
- NÃO reescreva o código, apenas explique
- Seja conciso e direto`;
        finalUserMessage = `Explique este arquivo (${filePath}):\n\`\`\`\n${fileContent}\n\`\`\``;
        console.log(`${COLORS.dim}[Modo Explain: Analisando '${filePath}'...]${COLORS.reset}`);
      } else {
        console.log(`${COLORS.red}Arquivo não encontrado: ${filePath}${COLORS.reset}\n`);
        continue;
      }
    } else if (lowerMsg.startsWith('/refactor ')) {
      currentCommand = '/refactor';
      const filePath = rawUserMessage.substring(10).trim();
      const fullPath = path.resolve(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        const fileSize = fs.statSync(fullPath).size;
        if (fileSize > 102400) {
          console.log(`${COLORS.yellow}⚠️ Arquivo muito grande (${(fileSize/1024).toFixed(0)}KB). Lendo primeiras 100KB...${COLORS.reset}`);
        }
        const fileContent = fs.readFileSync(fullPath, "utf-8").substring(0, 102400);
        systemPrompt = `Você é um Especialista em Refatoração de Código. Sua tarefa é melhorar o código fornecido seguindo as melhores práticas:
- Extraia funções/métodos quando código está muito longo
- Simplifique condicionais complexas
- Remova código duplicado
- Melhore nomes de variáveis e funções
- Aplique padrões de design quando apropriado
- Otimize performance quando possível
- NÃO mude a lógica externa (API pública deve permanecer igual)
- Use <patch> para cada alteração cirúrgica`;
        finalUserMessage = `Refatore este arquivo (${filePath}). Foque em legibilidade, manutenibilidade e performance:\n\`\`\`\n${fileContent}\n\`\`\``;
        console.log(`${COLORS.dim}[Modo Refactor: Analisando '${filePath}'...]${COLORS.reset}`);
      } else {
        console.log(`${COLORS.red}Arquivo não encontrado: ${filePath}${COLORS.reset}\n`);
        continue;
      }
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
    } else if (lowerMsg === '/menu' || lowerMsg === 'menu') {
      const { startTerminalUI } = require("./terminalUI");
      await startTerminalUI(port);
      clearScreen();
      console.log(`\n💬 ${COLORS.bright}${COLORS.cyan}HiperRouter Agent (God Mode) 🚀${COLORS.reset} - Model: ${COLORS.dim}${model}${COLORS.reset}`);
      console.log(`${COLORS.dim}Comandos: /plan, /code, /test <arq>, /commit, /review, /skill, /debug, /read <arq>, /model, /web, /menu, /history [n], /status, /undo, /save [arq], /clear, /exit${COLORS.reset}\n`);
      continue;
    } else if (lowerMsg === '/doctor' || lowerMsg === 'doctor') {
      const { run } = require("./commands/doctor");
      await run([]);
      const { pause } = require("./utils/input");
      await pause();
      continue;
    } else if (lowerMsg === '/key' || lowerMsg === 'key' || lowerMsg === 'chaves') {
      const { run } = require("./commands/key");
      await run([]);
      continue;
    } else if (lowerMsg === '/backup' || lowerMsg === 'backup') {
      const { run } = require("./commands/backup");
      await run([]);
      continue;
    } else if (lowerMsg === '/stats' || lowerMsg === 'stats') {
      const { run } = require("./commands/stats");
      await run([]);
      const { pause } = require("./utils/input");
      await pause();
      continue;
    } else if (lowerMsg === '/mcp' || lowerMsg === 'mcp') {
      const { run } = require("./commands/mcp");
      await run([]);
      continue;
    } else if (lowerMsg === '/benchmark' || lowerMsg === 'benchmark') {
      const { run } = require("./commands/benchmark");
      await run([]);
      const { pause } = require("./utils/input");
      await pause();
      continue;
    } else if (lowerMsg === '/tunnel' || lowerMsg === 'tunnel') {
      const { run } = require("./commands/tunnel");
      await run([]);
      const { pause } = require("./utils/input");
      await pause();
      continue;
    } else if (lowerMsg === '/memory' || lowerMsg === 'memory') {
      const { run } = require("./commands/memory");
      await run([]);
      const { pause } = require("./utils/input");
      await pause();
      continue;
    } else if (lowerMsg === '/proxypools' || lowerMsg === 'proxypools' || lowerMsg === 'pools') {
      const api = require("./api/client");
      console.log(`\n🌊 ${COLORS.bright}POOLS DE PROXIES & CLOUDFLARE WORKERS:${COLORS.reset}`);
      try {
        const res = await api.makeRequest("GET", "/api/proxy-pools");
        console.log(JSON.stringify(res.data || res, null, 2));
      } catch(e) { console.log(`Erro: ${e.message}`); }
      const { pause } = require("./utils/input");
      await pause();
      continue;
    } else if (lowerMsg === '/providers' || lowerMsg === 'providers' || lowerMsg === 'provedores') {
      const { showProvidersMenu } = require("./menus/providers");
      await showProvidersMenu(["HiperRouter", "Providers"]);
      clearScreen();
      continue;
    } else if (lowerMsg === '/combos' || lowerMsg === 'combos') {
      const { showCombosMenu } = require("./menus/combos");
      await showCombosMenu(["HiperRouter", "Combos"]);
      clearScreen();
      continue;
    } else if (lowerMsg === '/alias' || lowerMsg === 'alias') {
      const { run } = require("./commands/alias");
      await run([]);
      continue;
    } else if (lowerMsg === '/personas' || lowerMsg === 'personas' || lowerMsg === 'persona') {
      const { run } = require("./commands/personas");
      await run([]);
      continue;
    } else if (lowerMsg === '/playground' || lowerMsg === 'playground' || lowerMsg === 'play') {
      const { run } = require("./commands/playground");
      await run([]);
      continue;
    } else if (lowerMsg === '/vacuum' || lowerMsg === 'vacuum' || lowerMsg === 'clean') {
      const { run } = require("./commands/vacuum");
      await run([]);
      continue;
    } else if (lowerMsg === '/logs' || lowerMsg === 'logs') {
      const { run } = require("./commands/logs");
      await run([]);
      continue;
    } else if (lowerMsg === '/keyhealth' || lowerMsg === 'keyhealth') {
      const { run } = require("./commands/keyHealth");
      await run([]);
      continue;
    } else if (lowerMsg.startsWith('/search ') || lowerMsg.startsWith('search ')) {
      const query = rawUserMessage.replace(/^(\/search|search)\s+/i, "");
      const { run } = require("./commands/websearch");
      await run([query]);
      continue;
    } else if (lowerMsg.startsWith('/pack') || lowerMsg.startsWith('pack')) {
      const parts = rawUserMessage.split(" ").slice(1);
      const { run } = require("./commands/pack");
      await run(parts);
      continue;
    } else if (lowerMsg === '/security' || lowerMsg === 'security' || lowerMsg === 'sast') {
      const { run } = require("./commands/security");
      await run([]);
      continue;
    } else if (lowerMsg === '/run-tests' || lowerMsg === 'run-tests' || lowerMsg === 'tests') {
      const { run } = require("./commands/testRunner");
      await run([]);
      continue;
    } else if (lowerMsg === '/architecture' || lowerMsg === 'architecture' || lowerMsg === 'arch') {
      const { run } = require("./commands/architecture");
      await run([]);
      continue;
    } else if (lowerMsg.startsWith('/consensus') || lowerMsg.startsWith('consensus')) {
      const query = rawUserMessage.replace(/^(\/consensus|consensus)\s*/i, "");
      const { run } = require("./commands/consensus");
      await run([query]);
      continue;
    } else if (lowerMsg === '/watch' || lowerMsg === 'watch') {
      const { run } = require("./commands/watcher");
      await run([]);
      continue;
    } else if (lowerMsg === '/deps' || lowerMsg === 'deps') {
      const { run } = require("./commands/deps");
      await run([]);
      continue;
    } else if (lowerMsg === '/changelog' || lowerMsg === 'changelog') {
      const { run } = require("./commands/changelog");
      await run([]);
      continue;
    } else if (lowerMsg === '/tokensaver' || lowerMsg === 'tokensaver' || lowerMsg === 'tsaver') {
      const { run } = require("./commands/tokensaver");
      await run([]);
      continue;
    } else if (lowerMsg === '/translator' || lowerMsg === 'translator' || lowerMsg === 'tradutor') {
      const { run } = require("./commands/translator");
      await run([]);
      continue;
    } else if (lowerMsg === '/media' || lowerMsg === 'media') {
      const { run } = require("./commands/media");
      await run([]);
      continue;
    } else if (lowerMsg === '/quota' || lowerMsg === 'quota' || lowerMsg === 'cotas') {
      const { run } = require("./commands/quota");
      await run([]);
      continue;
    } else if (lowerMsg === '/consolelog' || lowerMsg === 'consolelog' || lowerMsg === 'console-log') {
      const { run } = require("./commands/consoleLog");
      await run([]);
      continue;
    } else if (lowerMsg === '/endpoint' || lowerMsg === 'endpoint') {
      const { run } = require("./commands/endpoint");
      await run([]);
      continue;
    } else if (lowerMsg === '/settings' || lowerMsg === 'settings' || lowerMsg === 'configuracoes') {
      const { showSettingsMenu } = require("./menus/settings");
      await showSettingsMenu(["HiperRouter", "Settings"]);
      clearScreen();
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

    // Comandos que editam código recebem regras extras de patch/file/tools
    const codeEditCommands = ['/code', '/test', '/debug'];
    const needsCodeEdit = !currentCommand || codeEditCommands.includes(currentCommand);
    const godModeRules = needsCodeEdit ? RULES_CORE + RULES_CODE_EDIT : RULES_CORE;

    const sysMsg = { role: "system", content: systemPrompt + godModeRules };

    if (messages.length > 0 && messages[0].role === "system") {
      messages[0] = sysMsg;
    } else {
      messages.unshift(sysMsg);
    }

    messages.push({ role: "user", content: finalUserMessage + appendedContext });

    const MAX_HISTORY = parseInt(process.env.HIPERROUTER_MAX_HISTORY || "20", 10);
    const currentTokens = estimateMessagesTokens(messages);
    const ctxLimit = getContextLimit(model);

    // Compress when hitting message limit OR when context > 60%
    if (messages.length > MAX_HISTORY + 1 || (messages.length > 4 && currentTokens > ctxLimit * 0.6)) {
      const displacedCount = messages.length > MAX_HISTORY + 1
        ? messages.length - (MAX_HISTORY + 1)
        : Math.max(1, Math.floor((messages.length - 3) / 2)); // Remove half of non-recent messages
      const displacedMessages = messages.slice(1, 1 + displacedCount);

      if (displacedMessages.length > 0) {
        const summary = await compressHistory(displacedMessages, { port, apiKey, model });

        if (summary) {
          messages = [
            messages[0],
            { role: "system", content: `[Memória da sessão anterior]:\n${summary}` },
            ...messages.slice(-Math.min(MAX_HISTORY, messages.length - displacedCount)),
          ];
        } else {
          messages = [messages[0], ...messages.slice(-MAX_HISTORY)];
        }
      }
    }

    // --- Pre-flight: Token limit check ---
    const totalTokensEst = estimateMessagesTokens(messages);
    if (totalTokensEst > ctxLimit * 0.85) {
      console.log(`${COLORS.red}❌ Contexto muito grande (~${totalTokensEst.toLocaleString()} tokens). Limite: ~${ctxLimit.toLocaleString()}.${COLORS.reset}`);
      console.log(`${COLORS.yellow}Use /clear para resetar ou aguarde compressão automática.${COLORS.reset}\n`);
      continue;
    }

    // --- AGENT RUNTIME: Ciclo formal LLM ↔ Terminal ---
    // Substitui o loop monolítico por agentRuntime.run()
    const registry = createDefaultRegistry();
    const runtime = new AgentRuntime({
      port, apiKey, model,
      toolRegistry: registry,
      confirmFn: confirmWithAuto,
    });

    // --- Display Event Handlers ---
    let runtimeSpinner = null;
    let runtimeSpinnerFrame = 0;
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let inCodeBlock = false;
    let codeBlockBuffer = "";
    let codeBlockLang = "";

    runtime.on("stream_start", () => {
      runtimeSpinnerFrame = 0;
      runtimeSpinner = setInterval(() => {
        process.stdout.write(`\r${COLORS.cyan}IA: ${COLORS.reset}${frames[runtimeSpinnerFrame++ % frames.length]} Pensando...`);
      }, 80);
    });

    runtime.on("chunk", (text) => {
      if (runtimeSpinner) {
        clearInterval(runtimeSpinner);
        runtimeSpinner = null;
        process.stdout.write(`\r${COLORS.cyan}IA: ${COLORS.reset}\x1b[K`);
      }

      // Track code blocks for syntax highlighting
      let remaining = text;
      while (remaining.length > 0) {
        if (!inCodeBlock) {
          const fenceStart = remaining.indexOf('```');
          if (fenceStart !== -1) {
            // Print text before fence (with markdown rendering)
            const beforeText = remaining.substring(0, fenceStart);
            if (beforeText) process.stdout.write(renderMarkdown(beforeText));
            const afterFence = remaining.substring(fenceStart + 3);
            const newlineIdx = afterFence.indexOf('\n');
            if (newlineIdx !== -1) {
              codeBlockLang = afterFence.substring(0, newlineIdx).trim();
              inCodeBlock = true;
              codeBlockBuffer = "";
              process.stdout.write(`${COLORS.dim}\`\`\`${codeBlockLang}${COLORS.reset}\n`);
              remaining = afterFence.substring(newlineIdx + 1);
            } else {
              process.stdout.write(remaining.substring(fenceStart));
              remaining = "";
            }
          } else {
            // No fence found - render markdown and print
            process.stdout.write(renderMarkdown(remaining));
            remaining = "";
          }
        } else {
          const fenceEnd = remaining.indexOf('```');
          if (fenceEnd !== -1) {
            codeBlockBuffer += remaining.substring(0, fenceEnd);
            // Highlight and print the code block
            const { highlightSyntax } = require("./utils/display");
            console.log(highlightSyntax(codeBlockBuffer));
            process.stdout.write(`${COLORS.dim}\`\`\`${COLORS.reset}\n`);
            inCodeBlock = false;
            codeBlockBuffer = "";
            codeBlockLang = "";
            remaining = remaining.substring(fenceEnd + 3);
          } else {
            codeBlockBuffer += remaining;
            remaining = "";
          }
        }
      }
    });

    runtime.on("tool_call_start", () => {
      if (runtimeSpinner) {
        clearInterval(runtimeSpinner);
        runtimeSpinner = null;
      }
      process.stdout.write(`\n${COLORS.cyan}🛠️  Preparando ação (Tool Call)...${COLORS.reset}\n`);
    });

    runtime.on("stream_end", () => {
      if (runtimeSpinner) {
        clearInterval(runtimeSpinner);
        runtimeSpinner = null;
      }
    });

    runtime.on("thinking", () => {
      // Indicador visual de re-entrada no LLM
    });

    runtime.on("error", (err) => {
      if (runtimeSpinner) {
        clearInterval(runtimeSpinner);
        runtimeSpinner = null;
      }
    });

    try {
      const result = await runtime.run(messages, { currentCommand });
      sessionRequestCount += result.requestCount;
      sessionTotalTokens += result.totalTokens;

      // --- Post-Runtime: Git Auto-Commit ---
      if (currentCommand === '/commit') {
        const jsonMatch = result.finalMessage.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          try {
            const commitData = JSON.parse(jsonMatch[1]);
            if (commitData.commitMessage) {
              // Show diff summary before confirming
              let diffSummary = "";
              try {
                diffSummary = execSync("rtk git diff --stat HEAD", { encoding: "utf8" });
              } catch {}
              if (diffSummary.trim()) {
                console.log(`\n${COLORS.cyan}📋 Arquivos alterados:${COLORS.reset}`);
                console.log(`${COLORS.dim}${diffSummary.trim()}${COLORS.reset}`);
              }
              const shouldCommit = await confirm(`\n${COLORS.yellow}Confirmar commit?\n"${commitData.commitMessage}"${COLORS.reset}`);
              if (shouldCommit) {
                spawnSync('git', ['add', '.'], { stdio: 'inherit' });
                spawnSync('git', ['commit', '-m', commitData.commitMessage], { stdio: 'inherit' });
                console.log(`${COLORS.green}✅ Commit realizado!${COLORS.reset}\n`);
              }
            }
          } catch(e) { console.log(`${COLORS.dim}[Commit: JSON inválido na resposta da IA]${COLORS.reset}`); }
        }
      }

      // --- Skill Auto-Creation ---
      if (currentCommand === '/skill') {
        const skillJsonMatch = result.finalMessage.match(/```json\n([\s\S]*?)\n```/);
        if (skillJsonMatch) {
          try {
            const skillData = JSON.parse(skillJsonMatch[1]);
            if (skillData.skillName && skillData.skillContent) {
              const skillsDir = path.resolve(__dirname, "../../..", "skills", skillData.skillName);
              if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
              fs.writeFileSync(path.join(skillsDir, "SKILL.md"), skillData.skillContent);
              console.log(`${COLORS.green}✅ Skill '${skillData.skillName}' criada!${COLORS.reset}\n`);
            }
          } catch (e) { console.log(`${COLORS.dim}[Skill: JSON inválido na resposta da IA]${COLORS.reset}`); }
        }
      }

      // --- Persistir histórico ---
      try {
        const compactMessages = messages.map(m => {
          if (m.role !== 'system' || m.content.length <= 2000) return m;
          const head = m.content.substring(0, 500);
          const tail = m.content.substring(m.content.length - 500);
          return { ...m, content: `${head}\n…[COMPACTADO ${m.content.length}→1000 chars — conteúdo completo processado pela IA]…\n${tail}` };
        });
        fs.writeFileSync(historyFile, JSON.stringify(compactMessages, null, 2));
      } catch(e) { if (process.env.DEBUG) console.warn("[history] save failed:", e.message); }

    } catch (err) {
      console.log(`\n${COLORS.red}Falha na comunicação: ${err.message}${COLORS.reset}`);
      messages.pop();
    }
  }
}

module.exports = { startChatUI };
