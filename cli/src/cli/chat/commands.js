const fs = require("fs");
const path = require("path");
const { COLORS } = require("../utils/input");

function showHelp() {
  console.log(`\n📖 ${COLORS.bright}${COLORS.cyan}CENTRAL DE AJUDA — COMANDOS DO HIPERROUTER AGENT (GOD MODE)${COLORS.reset}\n`);
  const helpMap = [
    { cmd: "/plan <instruções>", desc: "Modo Planejamento: Gera arquitetura/plano sem alterar código." },
    { cmd: "/code <instruções>", desc: "Modo Coding: Simula subagentes de arquitetura e QA antes de codar." },
    { cmd: "/test <arquivo>", desc: "Gerador de Testes: Analisa o arquivo e cria os testes unitários." },
    { cmd: "/commit", desc: "Auto-Commit: Analisa o git diff e realiza um commit semântico." },
    { cmd: "/review", desc: "Auditoria de Código: Revisa o git diff buscando bugs, Zod e SSRF." },
    { cmd: "/skill <instruções>", desc: "Gerador de Skill: Cria uma nova skill personalizada no projeto." },
    { cmd: "/debug", desc: "Modo Debug: Captura os últimos erros PM2 (9router) para correção." },
    { cmd: "/read <arquivo>", desc: "Leitor: Injeta o conteúdo de um arquivo local na conversa." },
    { cmd: "/model", desc: "Trocar Modelo: Abre menu interativo com filtro de busca." },
    { cmd: "/fav", desc: "Favoritar Modelo: Adiciona/remove modelo atual dos favoritos." },
    { cmd: "/palette", desc: "Command Palette: Busca fuzzy por comandos (ou Ctrl+K)." },
    { cmd: "/web", desc: "Painel Web: Abre a URL do dashboard no seu navegador." },
    { cmd: "/menu", desc: "Menu Principal: Abre a TUI interativa de gerenciamento." },
    { cmd: "/history [n]", desc: "Histórico: Exibe as últimas N mensagens trocadas no chat." },
    { cmd: "/status", desc: "Status API: Verifica se o servidor proxy está respondendo (ping)." },
    { cmd: "/undo", desc: "Restaurar Backup: Reverte o arquivo para o backup .bak do último patch." },
    { cmd: "/save [arquivo]", desc: "Salvar Chat: Exporta toda a conversa para um arquivo Markdown." },
    { cmd: "/copy", desc: "Copiar Resposta: Copia toda a última resposta da IA para o clipboard." },
    { cmd: "/copy-code", desc: "Copiar Código: Copia apenas o último bloco de código para o clipboard." },
    { cmd: "/paste", desc: "Modo Multilinhas: Buffer para colar prompts ou logs extensos." },
    { cmd: "/image [arquivo]", desc: "Visão/Clipboard: Captura imagem do clipboard ou arquivo para a IA." },
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
  const auditLogPath = path.resolve(__dirname, "../../../..", ".HiperRouter", "audit.log");
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

module.exports = {
  showHelp,
  showAuditLogs,
};
