const api = require("../api/client");
const { pause } = require("../utils/input");
const { showMenuWithBack } = require("../utils/menuHelper");

async function run(args) {
  const [action, name, cmd] = args || [];

  if (action === "list" || !action) {
    await renderMcpMenu();
    return 0;
  }
}

async function renderMcpMenu() {
  await showMenuWithBack({
    title: "🎛️ MCP Manager (Model Context Protocol)",
    headerContent: "Gerencie servidores e ferramentas de contexto MCP ativos no HiperRouter:",
    items: [
      {
        label: "📜 Listar Servidores MCP Configurados",
        action: async () => {
          console.log(`\n⏳ Buscando servidores MCP...`);
          try {
            const res = await api.getCliToolSettings("cowork-mcp-registry");
            if (res.success && res.data) {
              console.log(JSON.stringify(res.data, null, 2));
            } else {
              console.log(`ℹ️  Nenhum servidor MCP externo registrado no momento.`);
            }
          } catch (e) {
            console.log(`❌ Erro ao buscar MCPs: ${e.message}`);
          }
          await pause();
        }
      },
      {
        label: "➕ Adicionar Servidor MCP (STDIO / SSE)",
        action: async () => {
          console.log(`\n💡 Para registrar um novo MCP Server, você pode adicionar a entrada JSON em ~/.HiperRouter/mcp.json ou usar o Dashboard Web em /dashboard/cli-tools.`);
          await pause();
        }
      }
    ],
    backLabel: "🚪 Voltar"
  });
}

module.exports = { run };
