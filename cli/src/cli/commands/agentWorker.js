/**
 * agentWorker.js — Loop de agente com tool use.
 * Invocado pelo task.js como processo filho.
 *
 * Env vars esperadas:
 *   HIPERROUTER_API_KEY   — Bearer token
 *   HIPERROUTER_PORT      — porta do gateway
 *   HIPERROUTER_MODEL     — modelo a usar
 *   HIPERROUTER_PROMPT    — prompt inicial
 *   HIPERROUTER_CWD       — diretório de trabalho (opcional, default: cwd)
 */
"use strict";

const http = require("http");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const API_KEY   = process.env.HIPERROUTER_API_KEY;
const API_PORT  = parseInt(process.env.HIPERROUTER_PORT || "20128", 10);
const MODEL     = process.env.HIPERROUTER_MODEL || "meu-combo";
const PROMPT    = process.env.HIPERROUTER_PROMPT || "";
const WORK_DIR  = process.env.HIPERROUTER_CWD || process.cwd();
const MAX_ITER  = parseInt(process.env.HIPERROUTER_MAX_ITER || "20", 10);

// Comandos bloqueados por segurança
const BLOCKED_COMMANDS = [
  /rm\s+-rf?\s+\//, /mkfs/, /dd\s+if=/, />\s*\/dev\/(s|h)d/,
  /chmod\s+777\s+\//, /chown.*\/etc/, /passwd/, /sudo\s+su/,
  /shutdown/, /reboot/, /halt/, /format/,
];

// ─── Ferramentas ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "Lista arquivos e subdiretórios de um caminho. Use '.' para o diretório atual.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Caminho relativo ou absoluto" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Lê o conteúdo completo de um arquivo de texto. Limite: 100KB.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Caminho do arquivo" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Cria ou sobrescreve um arquivo com o conteúdo fornecido.",
      parameters: {
        type: "object",
        properties: {
          path:    { type: "string", description: "Caminho do arquivo" },
          content: { type: "string", description: "Conteúdo a escrever" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Executa um comando shell no diretório de trabalho. Comandos destrutivos são bloqueados. Timeout: 15s.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando shell a executar" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Busca um padrão (regex) em arquivos do projeto. Equivale a grep -r.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Padrão de busca (regex)" },
          dir:     { type: "string", description: "Diretório base (default: '.')" },
          include: { type: "string", description: "Filtro de arquivo, ex: '*.js'" },
        },
        required: ["pattern"],
      },
    },
  },
];

// ─── Execução de ferramentas ──────────────────────────────────────────────────

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.join(WORK_DIR, p);
}

function toolListDir(args) {
  const target = resolvePath(args.path || ".");
  try {
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const lines = entries.map((e) => `${e.isDirectory() ? "d" : "f"}  ${e.name}`);
    return `${target}:\n${lines.join("\n")}`;
  } catch (e) {
    return `ERRO: ${e.message}`;
  }
}

function toolReadFile(args) {
  const target = resolvePath(args.path);
  try {
    const stat = fs.statSync(target);
    if (stat.size > 100 * 1024) return `ERRO: Arquivo muito grande (${stat.size} bytes). Máximo: 100KB.`;
    return fs.readFileSync(target, "utf8");
  } catch (e) {
    return `ERRO: ${e.message}`;
  }
}

function toolWriteFile(args) {
  const target = resolvePath(args.path);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, args.content, "utf8");
    return `OK: arquivo escrito em ${target}`;
  } catch (e) {
    return `ERRO: ${e.message}`;
  }
}

function toolRunCommand(args) {
  const cmd = args.command;
  for (const blocked of BLOCKED_COMMANDS) {
    if (blocked.test(cmd)) return `BLOQUEADO: comando proibido por segurança — "${cmd}"`;
  }
  try {
    const out = execSync(cmd, {
      cwd: WORK_DIR,
      timeout: 15000,
      maxBuffer: 200 * 1024,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out || "(sem saída)";
  } catch (e) {
    return `ERRO (exit ${e.status}):\n${e.stderr || e.message}`;
  }
}

function toolSearchFiles(args) {
  const dir = resolvePath(args.dir || ".");
  const include = args.include ? `--include="${args.include}"` : "";
  const cmd = `grep -r ${include} -n --max-count=5 -E "${args.pattern.replace(/"/g, '\\"')}" "${dir}" 2>/dev/null | head -50`;
  try {
    const out = execSync(cmd, { encoding: "utf8", timeout: 10000 });
    return out || "(nenhum resultado)";
  } catch {
    return "(nenhum resultado)";
  }
}

function executeTool(name, rawArgs) {
  let args;
  try { args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs; }
  catch { return `ERRO: argumentos inválidos: ${rawArgs}`; }

  switch (name) {
    case "list_dir":     return toolListDir(args);
    case "read_file":    return toolReadFile(args);
    case "write_file":   return toolWriteFile(args);
    case "run_command":  return toolRunCommand(args);
    case "search_files": return toolSearchFiles(args);
    default:             return `ERRO: ferramenta desconhecida "${name}"`;
  }
}

// ─── Chamada ao gateway ───────────────────────────────────────────────────────

function callGateway(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: "auto", stream: false });
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: API_PORT,
        path: "/api/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "Authorization": `Bearer ${API_KEY}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)));
            resolve(json);
          } catch (e) {
            reject(new Error(`Resposta inválida do gateway: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ─── Loop principal ───────────────────────────────────────────────────────────

async function agentLoop() {
  if (!PROMPT) { console.error("ERRO: HIPERROUTER_PROMPT não definido."); process.exit(1); }
  if (!API_KEY) { console.error("ERRO: HIPERROUTER_API_KEY não definido."); process.exit(1); }

  console.log(`\n🤖 Agente iniciado`);
  console.log(`   modelo: ${MODEL} | porta: ${API_PORT} | cwd: ${WORK_DIR}`);
  console.log(`   max iterações: ${MAX_ITER}\n`);

  const messages = [
    {
      role: "system",
      content: `Você é um agente CLI eficiente. Você tem acesso a ferramentas para explorar o sistema de arquivos, ler e escrever arquivos, e executar comandos shell. Use-as proativamente para completar tarefas sem pedir informações ao usuário — pesquise, leia os arquivos relevantes e aja. Diretório de trabalho: ${WORK_DIR}`,
    },
    { role: "user", content: PROMPT },
  ];

  for (let i = 1; i <= MAX_ITER; i++) {
    process.stdout.write(`\n[iter ${i}/${MAX_ITER}] Pensando...`);

    let response;
    try {
      response = await callGateway(messages);
    } catch (e) {
      console.error(`\n❌ Erro no gateway: ${e.message}`);
      process.exit(1);
    }

    const choice = response.choices?.[0];
    if (!choice) { console.error("\n❌ Resposta inesperada do gateway."); process.exit(1); }

    // Modelo quer chamar ferramentas
    if (choice.finish_reason === "tool_calls") {
      const toolCalls = choice.message.tool_calls || [];
      messages.push(choice.message);

      for (const call of toolCalls) {
        const { name, arguments: rawArgs } = call.function;
        process.stdout.write(`\n  🔧 ${name}(${rawArgs})`);
        const result = executeTool(name, rawArgs);
        const preview = result.length > 120 ? result.slice(0, 120) + "..." : result;
        process.stdout.write(` → ${preview}`);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
      continue;
    }

    // Resposta final
    const finalContent = choice.message?.content || "(sem resposta)";
    console.log(`\n\n${"─".repeat(60)}`);
    console.log(finalContent);
    console.log(`${"─".repeat(60)}`);
    console.log(`\n✅ Agente finalizou em ${i} iteração(ões).`);
    process.exit(0);
  }

  console.log(`\n⚠️  Limite de ${MAX_ITER} iterações atingido.`);
  process.exit(0);
}

agentLoop().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
