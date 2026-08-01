/**
 * mcpTool — Processa chamadas a ferramentas MCP (Model Context Protocol).
 *
 * Fase: 'post'
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { COLORS } = require('../../utils/input');
const { getCliDataDir } = require('../../constants');

module.exports = {
  name: "mcpTool",
  description: "Executa ferramentas em servidores MCP (Model Context Protocol)",
  phase: "post",

  extract(aiFullMessage) {
    const matches = [...aiFullMessage.matchAll(/<mcp_call\s+server="([^"]+)"\s+tool="([^"]+)"\s*>([\s\S]*?)<\/mcp_call>/g)];
    const actions = [];

    for (const match of matches) {
      const server = match[1].trim();
      const toolName = match[2].trim();
      let argsStr = match[3].trim();
      let args = {};

      try {
        if (argsStr) {
           args = JSON.parse(argsStr);
        }
      } catch (e) {
        // Fallback or ignore if unparseable
        console.log(`${COLORS.yellow}⚠️ MCP Tool Call: Falha ao fazer parse dos argumentos JSON.${COLORS.reset}`);
      }
      
      actions.push({ server, toolName, args, rawMatch: match[0] });
    }

    return actions;
  },

  async execute(action, context) {
    const { messages, aiFullMessage } = context;
    const { server, toolName, args } = action;

    console.log(`\n${COLORS.cyan}[MCP] Chamando ferramenta '${toolName}' no servidor '${server}'...${COLORS.reset}`);

    // Lê a configuração do MCP
    let mcpServers = {};
    try {
       const mcpConfigPath = path.join(getCliDataDir(), 'mcp.json');
       if (fs.existsSync(mcpConfigPath)) {
          mcpServers = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8')).mcpServers || {};
       }
    } catch(e) {}

    const serverConfig = mcpServers[server];
    if (!serverConfig) {
       console.log(`${COLORS.red}Erro: Servidor MCP '${server}' não encontrado em mcp.json.${COLORS.reset}`);
       messages.push({ role: "assistant", content: aiFullMessage });
       messages.push({ role: "system", content: `Erro: Servidor MCP '${server}' não configurado. Adicione-o ao mcp.json.` });
       return { aiThinking: true, shouldBreak: true };
    }

    // Executa o MCP Server (JSON-RPC STDIO simples)
    return new Promise((resolve) => {
       const proc = spawn(serverConfig.command, serverConfig.args, { env: { ...process.env, ...serverConfig.env } });
       
       let output = "";
       let errorOutput = "";

       proc.stdout.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
             if (!line.trim()) continue;
             try {
                const msg = JSON.parse(line);
                if (msg.id === 1 && msg.result) {
                   // Initialization successful, now call the tool
                   const toolCallReq = {
                      jsonrpc: "2.0",
                      id: 2,
                      method: "tools/call",
                      params: {
                         name: toolName,
                         arguments: args
                      }
                   };
                   proc.stdin.write(JSON.stringify(toolCallReq) + "\n");
                } else if (msg.id === 2) {
                   // Tool call response
                   if (msg.error) {
                      errorOutput = msg.error.message || JSON.stringify(msg.error);
                   } else if (msg.result && msg.result.content) {
                      output = msg.result.content.map(c => c.text).join('\n');
                   } else {
                      output = JSON.stringify(msg.result);
                   }
                   proc.kill();
                }
             } catch(e) {
                // Ignore non-json output
             }
          }
       });

       proc.stderr.on('data', (data) => {
          // Some servers write logs to stderr, we can ignore or store it
       });

       proc.on('close', () => {
          messages.push({ role: "assistant", content: aiFullMessage });
          
          if (errorOutput) {
             console.log(`${COLORS.red}❌ Erro no MCP: ${errorOutput}${COLORS.reset}`);
             messages.push({ role: "system", content: `A ferramenta MCP falhou com o erro: ${errorOutput}` });
          } else {
             console.log(`${COLORS.green}✅ Ferramenta MCP executada!${COLORS.reset}`);
             messages.push({ role: "system", content: `Resultado da ferramenta MCP (${server}.${toolName}):\n${output || 'OK'}` });
          }
          
          resolve({ aiThinking: true, shouldBreak: true });
       });

       // Trigger initialization
       const initReq = {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
             protocolVersion: "2024-11-05",
             capabilities: {},
             clientInfo: { name: "hiperrouter-cli", version: "1.0.0" }
          }
       };
       proc.stdin.write(JSON.stringify(initReq) + "\n");
    });
  }
};
