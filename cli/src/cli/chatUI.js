const { selectModelFromList } = require("./utils/modelSelector");
const { prompt, confirm, COLORS } = require("./utils/input");

const autoApprovedCommands = new Set();
async function confirmWithAuto(question, actionKey) {
  if (autoApprovedCommands.has(actionKey)) return true;
  while (true) {
    const answer = await prompt(`${question} (y/n/s): `);
    const lower = answer.toLowerCase();
    if (lower === "y" || lower === "yes" || lower === "sim") return true;
    if (lower === "n" || lower === "no" || lower === "nao" || lower === "não") return false;
    if (lower === "s" || lower === "sempre" || lower === "similar") {
      autoApprovedCommands.add(actionKey);
      return true;
    }
    console.log("Responda 'y' (sim), 'n' (não) ou 's' (sempre aprovar esta ação exata).");
  }
}
const { clearScreen } = require("./utils/display");
const api = require("./api/client");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

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
  const appDir = path.resolve(__dirname, "../../..", ".9router");
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  // Sanitize the current working directory path to create a unique filename per project
  const sanitizedPath = process.cwd().replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return path.join(appDir, `chat_history_${sanitizedPath}.json`);
}

async function startChatUI(port) {
  let model = await selectModelFromList("Select Model for Chat", "", { excludeCombos: false });
  if (!model) return;

  const keysResult = await api.getApiKeys();
  let keys = keysResult.success ? (keysResult.data.keys || []) : [];
  let apiKey = "sk-f8be614b23b07bf8-6zg78i-217dcd1d"; // Chave solicitada
  
  // Garantir fallback seguro caso a chave solicitada não exista ou a requisição falhe
  if (!keys.find(k => k.key === apiKey)) {
    if (keys.length > 0) {
      apiKey = keys[0].key;
    } else {
      const createRes = await api.createApiKey("CLI Auto Key");
      if (createRes.success && createRes.data) {
        apiKey = createRes.data.key || "no-key";
      }
    }
  }

  clearScreen();
  console.log(`\n💬 ${COLORS.bright}${COLORS.cyan}HiperRouter Agent (God Mode) 🚀${COLORS.reset} - Model: ${COLORS.dim}${model}${COLORS.reset}`);
  console.log(`${COLORS.dim}Comandos: /plan, /code, /test <arq>, /commit, /review, /skill, /debug, /read <arq>, /model, /web, /menu, /clear, /exit${COLORS.reset}\n`);

  let messages = [];
  const historyFile = getHistoryFilePath();
  
  try {
    if (fs.existsSync(historyFile)) {
      const savedMessages = JSON.parse(fs.readFileSync(historyFile, "utf-8"));
      if (Array.isArray(savedMessages) && savedMessages.length > 0) {
        messages = savedMessages;
        console.log(`${COLORS.dim}[Sessão anterior restaurada. Use /clear para reiniciar]${COLORS.reset}\n`);
      }
    }
  } catch (e) {}

  const projectContext = getProjectContext();

  while (true) {
    let rawUserMessage = await prompt(`${COLORS.green}Você: ${COLORS.reset}`);
    let lowerMsg = rawUserMessage.toLowerCase().trim();
    
    if (lowerMsg === 'exit' || lowerMsg === 'quit' || lowerMsg === '/exit') break;
    if (lowerMsg === '/clear') {
      messages = [];
      try { fs.unlinkSync(historyFile); } catch(e) {}
      console.log(`${COLORS.dim}Histórico do chat limpo.${COLORS.reset}\n`);
      continue;
    }

    let appendedContext = "";
    const readMatch = rawUserMessage.match(/(?:^|\s)\/read\s+([^\s]+)/i);
    if (readMatch) {
      const filePath = readMatch[1];
      const fullPath = path.resolve(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, "utf-8");
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
      systemPrompt = `Você é um Arquiteto de Software de Elite. Sua tarefa é criar um plano detalhado. Não escreva o código final.\n\nContexto do Projeto:\n${projectContext}`;
      finalUserMessage = rawUserMessage.substring(6).trim();
      console.log(`${COLORS.dim}[Modo Planning Ativado]${COLORS.reset}`);
    } else if (lowerMsg.startsWith('/code ')) {
      currentCommand = '/code';
      systemPrompt = `Você é um Engenheiro de Software Sênior (Líder Técnico). Simule subagentes de Arquitetura e QA antes do código final. Escreva código seguro.\n\nContexto do Projeto:\n${projectContext}`;
      finalUserMessage = rawUserMessage.substring(6).trim();
      console.log(`${COLORS.dim}[Modo Coding Ativado - Orquestrando subagentes...]${COLORS.reset}`);
    } else if (lowerMsg.startsWith('/test ')) {
      currentCommand = '/test';
      const filePath = rawUserMessage.substring(6).trim();
      const fullPath = path.resolve(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, "utf-8");
        systemPrompt = `Você é um Especialista em Testes (QA). Crie os testes unitários completos para o código fornecido usando o framework do projeto. Salve usando OBRIGATORIAMENTE a tag <file path="novoArquivo.test.js">.\n\nContexto do Projeto:\n${projectContext}`;
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
      systemPrompt = `Você é um Subagente de Segurança e QA Sênior. Revise o git diff (uncommitted) buscando bugs críticos, erros de Zod, SSRF ou arquitetura frágil conforme as Regras Globais.\n\nContexto do Projeto:\n${projectContext}`;
      finalUserMessage = `Revise este diff não commitado e recomende melhorias antes do commit:\n\`\`\`diff\n${gitDiff.substring(0, 50000)}\n\`\`\``;
      console.log(`${COLORS.dim}[Modo Review - Auditando seu código pendente...]${COLORS.reset}`);
    } else if (lowerMsg.startsWith('/skill ')) {
      currentCommand = '/skill';
      systemPrompt = `Você é um Especialista em IA. Crie a skill em um bloco JSON com 'skillName' e 'skillContent'.\nContexto do Projeto:\n${projectContext}`;
      finalUserMessage = rawUserMessage.substring(7).trim();
      console.log(`${COLORS.dim}[Modo Skill Ativado]${COLORS.reset}`);
    } else if (lowerMsg === '/debug') {
      currentCommand = '/debug';
      systemPrompt = `Você é um Especialista em Debugging Sênior. Analise e corrija o erro com base no projeto.\n\nContexto do Projeto:\n${projectContext}`;
      let errorLogs = "";
      try { errorLogs = execSync("rtk pm2 logs 9router --lines 50 --nostream --err", { encoding: "utf8" }); } catch(e) { errorLogs = "Erro ao buscar logs PM2."; }
      finalUserMessage = `Logs de erro PM2:\n\`\`\`\n${errorLogs}\n\`\`\`\n${rawUserMessage}`;
      console.log(`${COLORS.dim}[Modo Debug - Capturando PM2 logs...]${COLORS.reset}`);
    } else if (lowerMsg === '/model') {
      const newModel = await selectModelFromList("Trocar de Modelo", model, { excludeCombos: false });
      if (newModel) model = newModel;
      
      console.log(`\n💬 ${COLORS.bright}${COLORS.cyan}HiperRouter Agent (God Mode) 🚀${COLORS.reset} - Model: ${COLORS.dim}${model}${COLORS.reset}`);
      console.log(`${COLORS.dim}Comandos: /plan, /code, /test <arq>, /commit, /review, /skill, /debug, /read <arq>, /model, /web, /menu, /clear, /exit${COLORS.reset}\n`);
      continue;
    } else if (lowerMsg === '/menu') {
      const { startTerminalUI } = require("./terminalUI");
      await startTerminalUI(port);
      clearScreen();
      console.log(`\n💬 ${COLORS.bright}${COLORS.cyan}HiperRouter Agent (God Mode) 🚀${COLORS.reset} - Model: ${COLORS.dim}${model}${COLORS.reset}`);
      console.log(`${COLORS.dim}Comandos: /plan, /code, /test <arq>, /commit, /review, /skill, /debug, /read <arq>, /model, /web, /menu, /clear, /exit${COLORS.reset}\n`);
      continue;
    } else if (lowerMsg === '/web') {
      const { getEndpoint } = require("./utils/endpoint");
      const { openBrowser } = require("./utils/browser");
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
      systemPrompt = `Você é um assistente de desenvolvimento prestativo.\n\nContexto do Projeto:\n${projectContext}`;
    }

    const godModeRules = `\nREGRAS CRÍTICAS DO SISTEMA (MODO DEUS):
1. TERMINAL: Qualquer sugestão de comando bash DEVE ser prefixada com 'rtk '. Seu CWD é ${process.cwd()}.
2. AUTO-DISCOVERY: Use <grep search="termo" /> sozinho se precisar buscar código. O sistema fará a busca.
3. WEB-SURFING: Para ler uma URL/doc na web, use <fetch url="https://..." /> sozinho. O sistema fará o download.
4. SMART PATCH: Para editar um arquivo existente, NÃO REESCREVA O ARQUIVO TODO. Use edição cirúrgica:
<patch path="caminho/arquivo.js">
<<<<
código antigo exato (linhas que vão ser removidas)
====
código novo (linhas que vão entrar)
>>>>
</patch>
5. AUTO-WRITE: Apenas para criar arquivos NOVOS, use <file path="caminho/arquivo.js">conteúdo completo</file>.
6. SCRIPTS TEMPORÁRIOS: Crie scripts temporários APENAS na pasta 'scripts/'. Nos blocos de comando bash, obrigatoriamente inclua a exclusão do script após o uso (ex: rtk node scripts/temp.js && rtk rm scripts/temp.js).
7. GRAPHIFY: Para consultar o grafo, NUNCA invente tags XML como <tool_call>. Use APENAS o terminal: \`\`\`bash\nrtk graphify query "sua pergunta"\n\`\`\`
8. ZERO XML: A interface final será exibida para humanos. É ESTRITAMENTE PROIBIDO gerar blocos <tool_call> ou <function>. Sempre que precisar de terminal, escreva de forma amigável e use EXCLUSIVAMENTE blocos markdown (ex: \`\`\`bash\ncomando\n\`\`\`).`;

    const sysMsg = { role: "system", content: systemPrompt + godModeRules };
    
    if (messages.length > 0 && messages[0].role === "system") {
      if (currentCommand) messages[0] = sysMsg;
    } else {
      messages.unshift(sysMsg);
    }

    messages.push({ role: "user", content: finalUserMessage + appendedContext });

    const MAX_HISTORY = 14;
    if (messages.length > MAX_HISTORY + 1) {
      messages = [messages[0], ...messages.slice(-MAX_HISTORY)];
    }

    let aiThinking = true;
    while (aiThinking) {
      aiThinking = false;
      try {
        process.stdout.write(`${COLORS.cyan}IA: ${COLORS.reset}`);
        
        const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model, messages: messages, stream: true })
        });

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
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.substring(6));
                  const content = data.choices[0]?.delta?.content || "";
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
                } catch (e) {}
              }
            }
          }
          if (pendingPrint.length > 0 && !inToolCall) {
            process.stdout.write(pendingPrint);
          }
        }

        // --- XML Tool Call Fallback (Suporte para modelos que forçam XML) ---
        const xmlToolMatches = [...aiFullMessage.matchAll(/<tool_call>[\s\S]*?<function=([^>]+)>([\s\S]*?)<\/function>[\s\S]*?<\/tool_call>/g)];
        for (const match of xmlToolMatches) {
          const funcName = match[1].trim();
          const paramsBlock = match[2];
          let cmd = "";
          
          if (funcName === "bash") {
            const cmdMatch = paramsBlock.match(/<parameter=command>([\s\S]*?)<\/parameter>/);
            if (cmdMatch) cmd = cmdMatch[1].trim();
          } else if (funcName === "grep") {
            const patternMatch = paramsBlock.match(/<parameter=pattern>([\s\S]*?)<\/parameter>/);
            const pathMatch = paramsBlock.match(/<parameter=path>([\s\S]*?)<\/parameter>/);
            if (patternMatch && pathMatch) {
              cmd = `rtk grep -in "${patternMatch[1].trim()}" ${pathMatch[1].trim()}`;
            }
          } else if (funcName === "query-graph") {
            const qMatch = paramsBlock.match(/<parameter=question>([\s\S]*?)<\/parameter>/);
            if (qMatch) cmd = `rtk graphify query "${qMatch[1].trim()}"`;
          }

          if (cmd) {
            const shouldRun = await confirmWithAuto(`\n${COLORS.yellow}Permitir Tool Call (${funcName})?\n${COLORS.dim}${cmd}${COLORS.reset}`, cmd);
            if (shouldRun) {
              const finalCmd = cmd.split('\n').map(line => {
                const t = line.trim();
                if (t && !t.startsWith('#') && !t.startsWith('rtk ')) return 'rtk ' + t;
                return line;
              }).join('\n');
              console.log(`\n${COLORS.green}Executando Tool Call: \n${finalCmd}${COLORS.reset}`);
              try {
                const output = execSync(finalCmd, { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
                console.log(output);
                messages.push({ role: "system", content: `Resultado do tool call (${funcName}):\n\`\`\`\n${output.substring(0, 50000)}\n\`\`\`\nContinue.` });
                aiThinking = true; break;
              } catch (err) {
                const errorLog = (err.stderr || err.stdout || err.message).toString();
                console.log(`${COLORS.red}Erro:\n${errorLog}${COLORS.reset}\n`);
                messages.push({ role: "system", content: `Erro no tool call:\n\`\`\`\n${errorLog}\n\`\`\`\nCorrija se necessário.` });
                aiThinking = true; break;
              }
            }
          }
        }

        console.log("\n");
        messages.push({ role: "assistant", content: aiFullMessage });
        try { fs.writeFileSync(historyFile, JSON.stringify(messages, null, 2)); } catch(e) {}

        // --- Autonomous Loop: Auto-Discovery (Grep) ---
        const grepMatch = aiFullMessage.match(/<grep\s+search="([^"]+)"\s*\/>/);
        if (grepMatch) {
          const term = grepMatch[1];
          console.log(`\n${COLORS.dim}🔍 [IA Auto-Discovery: Buscando internamente por '${term}'...]${COLORS.reset}`);
          let grepResult = "";
          try { 
            grepResult = execSync(`rtk git grep -in "${term}" | head -n 30`, { encoding: "utf8" }); 
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
            const res = await fetch(targetUrl);
            const html = await res.text();
            webContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 15000);
          } catch(e) { webContent = "Falha ao acessar URL."; }
          
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
                  execSync(`rtk git add . && rtk git commit -m "${commitData.commitMessage.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
                  console.log(`${COLORS.green}✅ Commit realizado!${COLORS.reset}\n`);
                }
              }
            } catch(e) {}
          }
        }

        // --- Smart Patch (Cirúrgico) ---
        const patchMatches = [...aiFullMessage.matchAll(/<patch\s+path="([^"]+)">\s*<<<<\n([\s\S]*?)\n====\n([\s\S]*?)\n>>>>\s*<\/patch>/g)];
        for (const match of patchMatches) {
          const filePath = match[1].trim();
          const oldCode = match[2];
          const newCode = match[3];
          const shouldWrite = await confirmWithAuto(`\n${COLORS.yellow}Aplicar Patch Cirúrgico no arquivo '${filePath}'?${COLORS.reset}`, "patch:" + filePath);
          if (shouldWrite) {
            try {
              const fullPath = path.resolve(process.cwd(), filePath);
              let content = fs.readFileSync(fullPath, "utf-8");
              if (content.includes(oldCode)) {
                content = content.replace(oldCode, newCode);
                fs.writeFileSync(fullPath, content);
                console.log(`${COLORS.green}✅ Patch cirúrgico aplicado!${COLORS.reset}\n`);
                try { execSync("rtk graphify update .", { cwd: process.cwd(), stdio: "ignore" }); } catch(e) {}
              } else {
                console.log(`${COLORS.red}⚠️ Falha: O código 'antigo' exato não foi encontrado no arquivo. Verifique indentação.${COLORS.reset}\n`);
              }
            } catch(e) { console.log(`${COLORS.red}Erro: ${e.message}${COLORS.reset}`); }
          }
        }

        // --- Auto-Write New Files ---
        const fileMatches = [...aiFullMessage.matchAll(/<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g)];
        for (const match of fileMatches) {
          const filePath = match[1].trim();
          const fileContent = match[2].trim();
          const shouldWrite = await confirmWithAuto(`\n${COLORS.yellow}Salvar novo arquivo '${filePath}'?${COLORS.reset}`, "file:" + filePath);
          if (shouldWrite) {
            try {
              const fullPath = path.resolve(process.cwd(), filePath);
              const dir = path.dirname(fullPath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(fullPath, fileContent);
              console.log(`${COLORS.green}✅ Arquivo criado!${COLORS.reset}\n`);
              try { execSync("rtk graphify update .", { cwd: process.cwd(), stdio: "ignore" }); } catch(e) {}
            } catch (err) {}
          }
        }

        // --- Auto-Run Bash com SELF-HEALING ---
        const bashMatches = [...aiFullMessage.matchAll(/```(?:bash|sh)\n([\s\S]*?)\n```/g)];
        for (const match of bashMatches) {
          const cmd = match[1].trim();
          const shouldRun = await confirmWithAuto(`\n${COLORS.yellow}Executar o comando sugerido acima?\n${COLORS.dim}${cmd}${COLORS.reset}`, cmd);
          if (shouldRun) {
            const finalCmd = cmd.split('\n').map(line => {
              const t = line.trim();
              if (t && !t.startsWith('#') && !t.startsWith('rtk ')) return 'rtk ' + t;
              return line;
            }).join('\n');
            console.log(`\n${COLORS.green}Executando: \n${finalCmd}${COLORS.reset}`);
            try {
              execSync(finalCmd, { stdio: "inherit" });
              console.log(`${COLORS.green}✅ Comando concluído.${COLORS.reset}\n`);
            } catch (err) {
              const errorLog = (err.stderr || err.stdout || err.message).toString();
              console.log(`${COLORS.red}Erro na execução:\n${errorLog}${COLORS.reset}\n`);
              console.log(`${COLORS.dim}🧟‍♂️ [IA Self-Healing: Analisando o erro e gerando correção...]${COLORS.reset}`);
              messages.push({ 
                role: "system", 
                content: `O comando '${finalCmd}' falhou com este erro:\n\`\`\`\n${errorLog}\n\`\`\`\nAnalise o erro, corrija o que for necessário (criando um patch de código ou sugerindo um comando diferente) e tente resolver autonomamente.` 
              });
              aiThinking = true; // RESTART LOOP PARA AUTO-CURA
              break; // Só lida com um erro de bash por vez
            }
          }
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
