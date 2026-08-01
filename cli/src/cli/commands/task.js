/**
 * hiperrouter task "<prompt>"
 * Envia prompt para o gateway local via /api/v1/chat/completions (SSE stream).
 */
const http = require("http");
const configStore = require("../utils/configStore");
const { resolvePort } = require("../utils/lifecycle");
const { getApiKeys, createApiKey } = require("../api/client");

/**
 * Obtém a API key para o CLI:
 * 1. Cache no configStore (localApiKey)
 * 2. Busca via gateway (getApiKeys)
 * 3. Cria uma nova (createApiKey) e salva no cache
 */
async function resolveLocalApiKey() {
  const cached = configStore.get("localApiKey");
  if (cached) return cached;

  process.stderr.write("🔑 Buscando API key no gateway...\n");

  const listRes = await getApiKeys();
  if (listRes.success && listRes.data?.keys?.length > 0) {
    const active = listRes.data.keys.find((k) => k.isActive);
    if (active) {
      configStore.set("localApiKey", active.key);
      return active.key;
    }
  }

  process.stderr.write("🔑 Nenhuma key encontrada. Criando uma nova para o CLI...\n");
  const createRes = await createApiKey("HiperRouter CLI");
  if (createRes.success && createRes.data?.key) {
    configStore.set("localApiKey", createRes.data.key);
    return createRes.data.key;
  }

  return null;
}

async function run(args) {
  // Parse flags: --model/-m, --port/-p, --help/-h
  const opts = { model: null, port: null };
  const promptParts = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === "--model" || a === "-m") && args[i + 1]) {
      opts.model = args[++i];
    } else if ((a === "--port" || a === "-p") && args[i + 1]) {
      opts.port = parseInt(args[++i], 10);
    } else if (a === "--help" || a === "-h") {
      console.log(`
Uso: hiperrouter task "<prompt>" [opções]

  -m, --model <id>   Modelo a usar (default: defaultModel do config)
  -p, --port  <n>    Porta do gateway (default: config ou 20128)
  -h, --help         Mostrar ajuda

Exemplos:
  hiperrouter task "explique este repo"
  hiperrouter task "refatore style.css para Tailwind" --model gc/gemini-2.5-pro
`);
      return 0;
    } else {
      promptParts.push(a);
    }
  }

  const taskPrompt = promptParts.join(" ").trim();
  if (!taskPrompt) {
    console.error('❌ Uso: hiperrouter task "<prompt>"');
    return 1;
  }

  const port = resolvePort(opts.port);
  const model = opts.model || configStore.get("defaultModel", "meu-combo");

  const apiKey = await resolveLocalApiKey();
  if (!apiKey) {
    console.error("❌ Não foi possível obter API key. Verifique se o gateway está rodando: hiperrouter status");
    return 1;
  }

  console.log(`🤖 Agente → modelo: ${model}  porta: ${port}`);
  console.log(`📝 Prompt: ${taskPrompt}\n`);

  const payload = JSON.stringify({
    model,
    messages: [{ role: "user", content: taskPrompt }],
    stream: true,
  });

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "Authorization": `Bearer ${apiKey}`,
        },
      },
      (res) => {
        if (res.statusCode >= 400) {
          // Se 401, limpa o cache — pode ser que a key foi revogada
          if (res.statusCode === 401) {
            configStore.set("localApiKey", undefined);
            console.error("❌ API key inválida ou revogada. Rode o comando novamente para obter uma nova.");
          } else {
            console.error(`❌ Gateway retornou HTTP ${res.statusCode}`);
          }
          res.resume();
          resolve(1);
          return;
        }

        let buffer = "";
        res.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop(); // guarda linha incompleta

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content || "";
              if (content) process.stdout.write(content);
            } catch {
              // linha SSE não-JSON — ignorar
            }
          }
        });

        res.on("end", () => {
          console.log("\n\n✅ Agente finalizou.");
          resolve(0);
        });

        res.on("error", (e) => {
          console.error(`\n❌ Erro na resposta: ${e.message}`);
          resolve(1);
        });
      }
    );

    req.on("error", (e) => {
      console.error(`❌ Não foi possível conectar ao gateway na porta ${port}: ${e.message}`);
      console.error(`   Verifique se o HiperRouter está rodando: hiperrouter status`);
      resolve(1);
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { run };
