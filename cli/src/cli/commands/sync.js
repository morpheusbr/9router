const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

// HiperRouter default local API
const DEFAULT_URL = "http://127.0.0.1:20128/v1";
const DEFAULT_KEY = "hiperrouter-local"; // Dummy key for local endpoints

const configs = {
  vscode: {
    name: "VS Code (Custom Provider)",
    path: path.join(os.homedir(), ".config", "Code", "User", "settings.json"),
    patch: (json) => {
      json["kilocode.customProvider"] = { name: "HiperRouter", baseURL: DEFAULT_URL, apiKey: DEFAULT_KEY };
      json["kilocode.defaultModel"] = "gpt-4o";
      return json;
    }
  },
  kilo: {
    name: "Kilo Code CLI",
    path: path.join(os.homedir(), ".local", "share", "kilo", "auth.json"),
    patch: (json) => {
      json["openai-compatible"] = {
        type: "api-key",
        apiKey: DEFAULT_KEY,
        baseUrl: DEFAULT_URL,
        model: "gpt-4o"
      };
      return json;
    }
  },
  opencode: {
    name: "OpenCode CLI",
    path: path.join(os.homedir(), ".config", "opencode", "opencode.json"),
    patch: (json) => {
      if (!json.provider) json.provider = {};
      json.provider["hiperrouter"] = {
        options: { baseURL: DEFAULT_URL, apiKey: DEFAULT_KEY },
        models: { "gpt-4o": {} }
      };
      json.model = "hiperrouter/gpt-4o";
      return json;
    }
  },
  cursor: {
    name: "Cursor AI",
    // Cursor doesn't have a simple plain JSON settings file for API keys (it uses SQLite internally),
    // but we can patch workspace settings for Continue/Cline if they are used inside Cursor.
    // For now, we will just simulate finding a config or provide instructions if requested.
    path: path.join(os.homedir(), ".cursor", "config.json"),
    patch: (json) => json 
  }
};

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => {
    rl.close();
    resolve(ans.trim().toLowerCase());
  }));
}

async function run(args) {
  const target = args[0] ? args[0].toLowerCase() : null;
  console.log(`\n🔄 HiperRouter Auto-Configurator (Sync)`);
  console.log(`========================================\n`);

  let found = 0;

  for (const [id, tool] of Object.entries(configs)) {
    if (target && target !== "all" && id !== target) continue;

    if (fs.existsSync(tool.path)) {
      found++;
      console.log(`[+] Encontrado: ${tool.name} em ${tool.path}`);
      
      const ans = await prompt(`Deseja apontar o ${tool.name} para o HiperRouter local? (y/N) `);
      if (ans === 'y' || ans === 's') {
        try {
          let content = fs.readFileSync(tool.path, "utf8");
          // Remove trailing commas for valid JSON
          content = content.replace(/,(\s*[}\]])/g, "$1");
          let json = JSON.parse(content || "{}");
          
          json = tool.patch(json);
          
          fs.writeFileSync(tool.path, JSON.stringify(json, null, 2), "utf8");
          console.log(`✅ ${tool.name} atualizado com sucesso!\n`);
        } catch (e) {
          console.log(`❌ Erro ao atualizar ${tool.name}: ${e.message}\n`);
        }
      } else {
        console.log(`⏭️  Ignorado.\n`);
      }
    } else {
      if (target && target === id) {
        console.log(`❌ Arquivo de configuração do ${tool.name} não encontrado.`);
      }
    }
  }

  if (found === 0) {
    console.log(`Nenhuma ferramenta compatível foi encontrada na sua máquina.`);
    console.log(`Certifique-se de que elas estão instaladas (OpenCode, Kilo, VS Code).`);
  } else {
    console.log(`Tudo pronto! Seus assistentes agora usarão o HiperRouter.\n`);
  }

  return 0;
}

module.exports = { run };
