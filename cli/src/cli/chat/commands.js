const fs = require("fs");
const path = require("path");
const { COLORS } = require("../utils/input");

function showHelp() {
  console.log(`\n📖 ${COLORS.bright}${COLORS.cyan}CENTRAL DE AJUDA — COMANDOS DO HIPERROUTER AGENT (GOD MODE)${COLORS.reset}\n`);
  const helpMap = [
    { cmd: "/plan <instruções>", desc: "Modo Planejamento: Gera arquitetura/plano sem alterar código. (Alias: /p)" },
    { cmd: "/code <instruções>", desc: "Modo Coding: Simula subagentes de arquitetura e QA antes de codar." },
    { cmd: "/test <arquivo>", desc: "Gerador de Testes: Analisa o arquivo e cria os testes unitários." },
    { cmd: "/commit", desc: "Auto-Commit: Analisa o git diff e realiza um commit semântico." },
    { cmd: "/review", desc: "Auditoria de Código: Revisa o git diff buscando bugs, Zod e SSRF." },
    { cmd: "/skill <instruções>", desc: "Gerador de Skill: Cria uma nova skill personalizada no projeto." },
    { cmd: "/debug", desc: "Modo Debug: Captura os últimos erros PM2 (9router) para correção." },
    { cmd: "/read <arquivo>", desc: "Leitor: Injeta o conteúdo de um arquivo local na conversa." },
    { cmd: "/model", desc: "Trocar Modelo: Abre menu interativo com filtro de busca." },
    { cmd: "/fav", desc: "Favoritar Modelo: Adiciona/remove modelo atual dos favoritos." },
    { cmd: "/palette", desc: "Command Palette: Busca fuzzy por comandos (ou Ctrl+K). (Alias: /cmd)" },
    { cmd: "/web", desc: "Painel Web: Abre a URL do dashboard no seu navegador." },
    { cmd: "/menu", desc: "Menu Principal: Abre a TUI interativa de gerenciamento." },
    { cmd: "/history [n]", desc: "Histórico: Exibe as últimas N mensagens trocadas no chat. (Alias: /h)" },
    { cmd: "/status", desc: "Status API: Verifica se o servidor proxy está respondendo (ping)." },
    { cmd: "/undo", desc: "Restaurar Backup: Reverte o arquivo para o backup .bak do último patch." },
    { cmd: "/save [arquivo]", desc: "Salvar Chat: Exporta toda a conversa para um arquivo Markdown." },
    { cmd: "/copy", desc: "Copiar Resposta: Copia toda a última resposta da IA para o clipboard. (Alias: /c)" },
    { cmd: "/copy-code", desc: "Copiar Código: Copia apenas o último bloco de código para o clipboard. (Alias: /cc)" },
    { cmd: "/paste", desc: "Modo Multilinhas: Buffer para colar prompts ou logs extensos." },
    { cmd: "/image [arquivo]", desc: "Visão/Clipboard: Captura imagem do clipboard ou arquivo para a IA. (Alias: /img)" },
    { cmd: "/rollback", desc: "Rollback Repositório: Reverte git ao snapshot pré-patch/comando." },
    { cmd: "/audit [n]", desc: "Log de Auditoria: Exibe os eventos salvos em .HiperRouter/audit.log." },
    { cmd: "/stats", desc: "Telemetria: Exibe requisições, tokens consumidos e tempo de sessão." },
    { cmd: "/help", desc: "Central de Ajuda: Exibe esta lista detalhada de comandos." },
    { cmd: "/clear", desc: "Limpar Chat: Reseta o histórico de mensagens e limpa a tela." },
    { cmd: "/exit", desc: "Sair: Encerra a sessão do HiperRouter Agent." }
  ];

  helpMap.forEach(item => {
    const paddedCmd = item.cmd.padEnd(20);
    console.log(`  ${COLORS.green}${paddedCmd}${COLORS.reset} ${COLORS.dim}${item.desc}${COLORS.reset}`);
  });
  console.log(`\n${COLORS.dim}Dica: Digite '/' e pressione TAB para autocompletar qualquer comando!${COLORS.reset}\n`);
}

function showAuditLogs(n = 15) {
  const { getCliDataDir } = require("../constants");
  const auditLogPath = path.join(getCliDataDir(), "audit.log");
  if (fs.existsSync(auditLogPath)) {
    const lines = fs.readFileSync(auditLogPath, 'utf-8').trim().split('\n').filter(Boolean);
    const recent = lines.slice(-n);
    console.log(`\n📜 ${COLORS.bright}LOG DE AUDITORIA (${recent.length} entradas):${COLORS.reset}`);
    recent.forEach(l => {
      try {
        const parsed = JSON.parse(l);
        console.log(`  ${COLORS.dim}[${parsed.timestamp.slice(11, 19)}]${COLORS.reset} ${COLORS.cyan}${parsed.action}${COLORS.reset} — ${JSON.stringify(parsed)}`);
      } catch(e) {
        console.log(`  ${l}`);
      }
    });
    console.log();
  } else {
    console.log(`${COLORS.dim}Nenhum log de auditoria encontrado ainda.${COLORS.reset}\n`);
  }
}

/**
 * Handle simple slash commands that don't need AI interaction.
 * Returns true if the command was handled completely (and the loop should 'continue').
 * Returns false if the command requires AI processing.
 */
async function handleSlashCommand(lowerMsg, rawUserMessage, state) {
  const { port, messages, model, sessionStartTime, sessionRequestCount, sessionTotalTokens, historyFile } = state;
  const { clearScreen } = require("../utils/display");
  const { prompt } = require("../utils/input");

  // Aliases
  if (lowerMsg === '/h') lowerMsg = '/history';
  if (lowerMsg.startsWith('/h ')) lowerMsg = lowerMsg.replace('/h ', '/history ');
  if (lowerMsg === '/c') lowerMsg = '/copy';
  if (lowerMsg === '/cc') lowerMsg = '/copy-code';
  if (lowerMsg === '/cmd') lowerMsg = '/palette';
  if (lowerMsg === '/img') lowerMsg = '/image';
  if (lowerMsg.startsWith('/img ')) lowerMsg = lowerMsg.replace('/img ', '/image ');
  if (lowerMsg.startsWith('/p ')) lowerMsg = lowerMsg.replace('/p ', '/plan ');

  // Update lowerMsg ref
  state.lowerMsg = lowerMsg;

  if (lowerMsg === '/clear' || rawUserMessage === "\x0C") {
    state.messages = [];
    try { fs.unlinkSync(historyFile); } catch(e) {}
    clearScreen();
    console.log(`${COLORS.dim}Histórico do chat limpo.${COLORS.reset}\n`);
    return true;
  }
  
  if (lowerMsg === '/fav') {
    const configStore = require("../utils/configStore");
    const favs = configStore.getArray("favoriteModels");
    if (favs.includes(model)) {
      const newFavs = favs.filter(m => m !== model);
      configStore.set("favoriteModels", newFavs);
      console.log(`${COLORS.dim}✗ ${model} removido dos favoritos.${COLORS.reset}\n`);
    } else {
      configStore.appendToArray("favoriteModels", model, 20);
      console.log(`${COLORS.green}★ ${model} adicionado aos favoritos! Aparece no topo da lista /model.${COLORS.reset}\n`);
    }
    return true;
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
    return true;
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
    return true;
  }

  if (lowerMsg === '/undo') {
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
      const { confirm } = require('../utils/input');
      const ok = await confirm(`\n${COLORS.yellow}Restaurar '${original}' a partir do backup '${newest}'?${COLORS.reset}`);
      if (ok) {
        fs.copyFileSync(newest, original);
        fs.unlinkSync(newest);
        console.log(`${COLORS.green}✅ Arquivo restaurado com sucesso.${COLORS.reset}\n`);
      }
    }
    return true;
  }

  if (lowerMsg.startsWith('/save')) {
    const arg = rawUserMessage.substring(5).trim();
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = arg || `chat-${dateStr}.md`;
    const fullSavePath = path.resolve(process.cwd(), filename);
    const lines = [`# Chat Session — ${new Date().toLocaleString('pt-BR')}\n\n`];
    const chatMessages = messages.filter(m => m.role !== 'system');
    if (chatMessages.length === 0) {
      console.log(`${COLORS.dim}Nenhuma mensagem na sessão para salvar.${COLORS.reset}\n`);
    } else {
      chatMessages.forEach(m => {
        const header = m.role === 'user' ? '## \u{1F464} Você' : '## \u{1F916} IA';
        lines.push(`${header}\n\n${m.content}\n\n---\n\n`);
      });
      try {
        fs.writeFileSync(fullSavePath, lines.join(''));
        console.log(`${COLORS.green}✅ Conversa salva em '${filename}'${COLORS.reset}\n`);
      } catch(e) {
        console.log(`${COLORS.red}Erro ao salvar: ${e.message}${COLORS.reset}\n`);
      }
    }
    return true;
  }

  if (lowerMsg === '/copy') {
    const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAiMsg) {
      console.log(`${COLORS.dim}Nenhuma resposta da IA no histórico para copiar.${COLORS.reset}\n`);
    } else {
      const { copyToClipboard } = require('../utils/clipboard');
      const ok = copyToClipboard(lastAiMsg.content);
      if (ok) console.log(`${COLORS.green}✅ Última resposta da IA copiada para a área de transferência!${COLORS.reset}\n`);
      else console.log(`${COLORS.red}Falha ao copiar para a área de transferência.${COLORS.reset}\n`);
    }
    return true;
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
        const { copyToClipboard } = require('../utils/clipboard');
        const ok = copyToClipboard(lastCode);
        if (ok) console.log(`${COLORS.green}✅ Último bloco de código copiado para a área de transferência!${COLORS.reset}\n`);
        else console.log(`${COLORS.red}Falha ao copiar para a área de transferência.${COLORS.reset}\n`);
      }
    }
    return true;
  }

  if (lowerMsg === '/rollback') {
    const { rollbackGitCheckpoint } = require("./patchEngine");
    try {
      const ok = rollbackGitCheckpoint();
      if (ok) console.log(`${COLORS.green}✅ Rollback executado com sucesso! Estado do repositório restaurado.${COLORS.reset}\n`);
      else console.log(`${COLORS.red}Nenhum checkpoint anterior encontrado ou falha ao reverter.${COLORS.reset}\n`);
    } catch (e) {
      console.log(`${COLORS.red}Erro ao realizar rollback: ${e.message}${COLORS.reset}\n`);
    }
    return true;
  }

  if (lowerMsg.startsWith('/audit')) {
    const n = parseInt(lowerMsg.split(' ')[1]) || 15;
    showAuditLogs(n);
    return true;
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
    return true;
  }

  if (lowerMsg === '/help' || lowerMsg === 'help') {
    showHelp();
    return true;
  }
  
  if (lowerMsg === '/web') {
    const { getEndpoint } = require("../utils/endpoint");
    const { openBrowser } = require("../utils/sysUtils");
    let serverUrl;
    try {
      const { endpoint, tunnelEnabled } = await getEndpoint(port);
      serverUrl = tunnelEnabled ? endpoint.replace(/\/v1$/, "") : `http://127.0.0.1:${port}`;
    } catch (e) {
      serverUrl = `http://127.0.0.1:${port}`;
    }
    console.log(`${COLORS.dim}Abrindo painel web em ${serverUrl}...${COLORS.reset}\n`);
    openBrowser(serverUrl);
    return true;
  }

  return false; // Not handled here
}

module.exports = {
  showHelp,
  showAuditLogs,
  handleSlashCommand
};
