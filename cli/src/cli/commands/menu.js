const { showMenuWithBack } = require("../utils/menuHelper");

async function run(args) {
  // If arguments were passed directly (e.g. `hiperrouter menu doctor`), dispatch it
  if (args && args.length > 0) {
    const action = args[0].toLowerCase();
    if (action === "doctor") return (require("./doctor")).run(args.slice(1));
    if (action === "key") return (require("./key")).run(args.slice(1));
    if (action === "stats") return (require("./stats")).run(args.slice(1));
    if (action === "backup") return (require("./backup")).run(args.slice(1));
    if (action === "sync") return (require("./sync")).run(args.slice(1));
    if (action === "alias") return (require("./alias")).run(args.slice(1));
  }

  // Otherwise, render interactive TUI menu using arrow keys
  await showMenuWithBack({
    title: "HiperRouter Interactive Control Panel",
    headerContent: "Escolha uma opção navegando pelas setas do teclado (↑/↓) e ENTER:",
    items: [
      {
        label: "🔌 Providers — Configuração e Status de Provedores",
        action: async () => {
          const { showProvidersMenu } = require("../menus/providers");
          await showProvidersMenu(["HiperRouter", "Providers"]);
        }
      },
      {
        label: "🔀 Combos — Grupos e Redirecionamentos de Modelos",
        action: async () => {
          const { showCombosMenu } = require("../menus/combos");
          await showCombosMenu(["HiperRouter", "Combos"]);
        }
      },
      {
        label: "🤖 Model — Alterar Modelo Padrão (OpenAI, Anthropic, Gemini...)",
        action: async () => {
          await (require("./model")).run([]);
          await pausePrompt();
        }
      },
      {
        label: "🩺 Doctor — Diagnóstico & Saúde do Sistema",
        action: async () => {
          await (require("./doctor")).run([]);
          await pausePrompt();
        }
      },
      {
        label: "🔑 Key Manager — Gerenciar Chaves de Provedores",
        action: async () => {
          await (require("./key")).run(["list"]);
          await pausePrompt();
        }
      },
      {
        label: "📊 Stats — Telemetria de Uso e Tokens",
        action: async () => {
          await (require("./stats")).run([]);
          await pausePrompt();
        }
      },
      {
        label: "🗄️ Backup Manager — Criar / Listar Snapshots",
        action: async () => {
          await (require("./backup")).run(["list"]);
          await pausePrompt();
        }
      },
      {
        label: "🔄 Sync — Configurar VSCode, Kilo, OpenCode",
        action: async () => {
          await (require("./sync")).run([]);
          await pausePrompt();
        }
      },
      {
        label: "⚡ Completion — Instalar Autocompletar no Shell",
        action: async () => {
          await (require("./completion")).run(["zsh"]);
          await pausePrompt();
        }
      },
      {
        label: "🎛️ MCP Manager — Gerenciar Servidores e Ferramentas MCP",
        action: async () => {
          await (require("./mcp")).run([]);
        }
      },
      {
        label: "🚀 Benchmark — Teste de Latência e Velocidade de Modelos",
        action: async () => {
          await (require("./benchmark")).run([]);
          await pausePrompt();
        }
      },
      {
        label: "🌐 Tunnel Manager — Status do Acesso Remoto HTTPS",
        action: async () => {
          await (require("./tunnel")).run([]);
          await pausePrompt();
        }
      },
      {
        label: "🧠 Memory & Context — Inspecionar Grafo do Projeto",
        action: async () => {
          await (require("./memory")).run([]);
          await pausePrompt();
        }
      },
      {
        label: "🌊 Proxy Pools — Pools de Proxies e Cloudflare Workers",
        action: async () => {
          const api = require("../api/client");
          console.log(`\n⏳ Buscando Proxy Pools...`);
          try {
            const res = await api.makeRequest("GET", "/api/proxy-pools");
            console.log(JSON.stringify(res.data || res, null, 2));
          } catch(e) { console.log(`Erro: ${e.message}`); }
          await pausePrompt();
        }
      },
      {
        label: "🛡️ PxPipe & MITM — Monitoramento e Tráfego",
        action: async () => {
          const api = require("../api/client");
          console.log(`\n⏳ Buscando status do PxPipe/MITM...`);
          try {
            const res = await api.makeRequest("GET", "/api/pxpipe/status");
            console.log(JSON.stringify(res.data || res, null, 2));
          } catch(e) { console.log(`Erro: ${e.message}`); }
          await pausePrompt();
        }
      },
      {
        label: "🔀 Alias Manager — Mapeamento & Redirecionamento de Modelos",
        action: async () => {
          await (require("./alias")).run([]);
        }
      },
      {
        label: "📝 Personas — Modo de Atuação e Regras do Agente",
        action: async () => {
          await (require("./personas")).run([]);
        }
      },
      {
        label: "🧪 Parallel Playground — Testar Prompt em Vários Modelos",
        action: async () => {
          await (require("./playground")).run([]);
        }
      },
      {
        label: "🧹 Database Vacuum — Otimizar e Desfragmentar SQLite",
        action: async () => {
          await (require("./vacuum")).run([]);
        }
      },
      {
        label: "📡 Live Log Stream — Tráfego de Requisições HTTP ao Vivo",
        action: async () => {
          await (require("./logs")).run([]);
        }
      },
      {
        label: "🔐 Key Rotation & Health — Monitoramento de Cotas e Failover",
        action: async () => {
          await (require("./keyHealth")).run([]);
        }
      },
      {
        label: "🌐 Web Search — Busca Integrada no Terminal",
        action: async () => {
          await (require("./websearch")).run([]);
        }
      },
      {
        label: "📦 Migration Pack — Exportar/Importar Pacote Completo de Configuração",
        action: async () => {
          await (require("./pack")).run([]);
        }
      },
      {
        label: "🛡️ Security Scanner — Auditoria SAST e Análise de Vulnerabilidades",
        action: async () => {
          await (require("./security")).run([]);
        }
      },
      {
        label: "🧪 Smart Test Runner — Execução Inteligente e Auto-Fixer de Testes",
        action: async () => {
          await (require("./testRunner")).run([]);
        }
      },
      {
        label: "🏗️ Architecture Generator — Diagramas Mermaid e Especificação de Arquitetura",
        action: async () => {
          await (require("./architecture")).run([]);
        }
      },
      {
        label: "🧠 Multi-Model Consensus — Debate e Síntese de 3 Modelos Simultâneos",
        action: async () => {
          await (require("./consensus")).run([]);
        }
      },
      {
        label: "⚡ Code Watcher & Guardrail — Monitoramento Vigilante em Tempo Real",
        action: async () => {
          await (require("./watcher")).run([]);
        }
      },
      {
        label: "🎯 Smart Dependency Lifecycle — Auditoria de Pacotes e Vulnerabilidades",
        action: async () => {
          await (require("./deps")).run([]);
        }
      },
      {
        label: "📜 Git Commit & Release Automator — Gerador de Changelogs de Release",
        action: async () => {
          await (require("./changelog")).run([]);
        }
      },
      {
        label: "🔤 Token Saver — Regras de Compressão e Redução de Custos",
        action: async () => {
          await (require("./tokensaver")).run([]);
        }
      },
      {
        label: "🌍 AI Translator — Tradutor Multilíngue Transparente de Prompts",
        action: async () => {
          await (require("./translator")).run([]);
        }
      },
      {
        label: "🎨 Media Providers — Provedores de Geração de Imagens e Visão",
        action: async () => {
          await (require("./media")).run([]);
        }
      },
      {
        label: "🎛️ Quota Control — Gerenciar Limites de Requisições e Orçamento",
        action: async () => {
          await (require("./quota")).run([]);
        }
      },
      {
        label: "📋 Console Log Viewer — Logs Brutos do Servidor Node.js / PM2",
        action: async () => {
          await (require("./consoleLog")).run([]);
        }
      },
      {
        label: "🔌 Endpoint Configurator — URLs de Conexão, Chave Local & Ping",
        action: async () => {
          await (require("./endpoint")).run([]);
        }
      },
      {
        label: "🛡️ Approval Mode — Configurar Edição Automática & Autonomia no Chat",
        action: async () => {
          const { selectMenu, pause } = require("../utils/input");
          const configStore = require("../utils/configStore");

          const items = [
            { label: "❓ Sempre Perguntar antes de cada edição ou comando (Padrão de Segurança)", mode: "ask" },
            { label: "⚡ Auto-Aprovar Edições de Arquivos e Patches (Pergunta apenas comandos bash)", mode: "patches" },
            { label: "🚀 Auto-Aprovar TUDO sem interrupção (Modo Autônomo Total)", mode: "all" }
          ];

          const idx = await selectMenu("Modo de Aprovação de Edições no Chat", items, 0, "Escolha o nível de autonomia do agente:");
          if (idx !== -1) {
            const selected = items[idx];
            configStore.set("autoApproveMode", selected.mode);
            console.log(`\n✅ Modo de aprovação alterado para: ${selected.label}`);
            await pause();
          }
        }
      }
    ],
    backLabel: "🚪 Sair do Menu"
  });

  return 0;
}

const { pause } = require("../utils/input");

function pausePrompt() {
  return pause("\nPressione [ENTER] para voltar ao menu...");
}

module.exports = { run };
