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
const { injectRtkPrefix } = require("../agent/bashExecutor");
const { validateSyntaxPostPatch, createRotatingBackup } = require("../chat/patchEngine");

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

// ─── Project Context ──────────────────────────────────────────────────────────

function getProjectContext() {
  let ctx = "";
  try {
    const agentsPath = path.join(WORK_DIR, "AGENTS.md");
    if (fs.existsSync(agentsPath)) ctx += fs.readFileSync(agentsPath, "utf8").substring(0, 3000) + "\n";
    const graphPath = path.join(WORK_DIR, "graphify-out", "GRAPH_REPORT.md");
    if (fs.existsSync(graphPath)) ctx += fs.readFileSync(graphPath, "utf8").substring(0, 3000) + "\n";
  } catch {}
  return ctx;
}

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
  {
    type: "function",
    function: {
      name: "patch_file",
      description: "Edição cirúrgica de arquivo existente. Substitui um trecho específico por outro. Cria backup automático.",
      parameters: {
        type: "object",
        properties: {
          path:     { type: "string", description: "Caminho do arquivo" },
          old_code: { type: "string", description: "Código a ser substituído (deve existir no arquivo)" },
          new_code: { type: "string", description: "Código que substituirá o antigo" },
        },
        required: ["path", "old_code", "new_code"],
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
  const cmd = injectRtkPrefix(args.command);
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
  const cmd = `rtk grep -r ${include} -n --max-count=5 -E "${args.pattern.replace(/"/g, '\\"')}" "${dir}" 2>/dev/null | head -50`;
  try {
    const out = execSync(cmd, { encoding: "utf8", timeout: 10000 });
    return out || "(nenhum resultado)";
  } catch {
    return "(nenhum resultado)";
  }
}

function toolPatchFile(args) {
  const target = resolvePath(args.path);
  try {
    if (!fs.existsSync(target)) return `ERRO: Arquivo não encontrado: ${target}`;

    const content = fs.readFileSync(target, "utf8");
    if (!content.includes(args.old_code)) {
      // Fuzzy match
      const normalize = s => s.replace(/\s+/g, ' ').trim();
      if (normalize(content).includes(normalize(args.old_code))) {
        return `ERRO: Match exato falhou. O código antigo não foi encontrado literalmente no arquivo. Forneça o código exato como aparece no arquivo.`;
      }
      return `ERRO: O código antigo não existe no arquivo. Leia o arquivo primeiro com read_file.`;
    }

    createRotatingBackup(target);
    const newContent = content.replace(args.old_code, args.new_code);
    fs.writeFileSync(target, newContent, "utf8");

    // Syntax validation
    const validation = validateSyntaxPostPatch(target);
    if (!validation.valid) {
      // Rollback
      const bakPath = target + '.bak.1';
      if (fs.existsSync(bakPath)) fs.copyFileSync(bakPath, target);
      return `ERRO: Patch gerou erro de sintaxe. Rollback aplicado.\n${validation.error}`;
    }

    return `OK: Patch aplicado em ${target}`;
  } catch (e) {
    return `ERRO: ${e.message}`;
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
    case "patch_file":   return toolPatchFile(args);
    default:             return `ERRO: ferramenta desconhecida "${name}"`;
  }
}

// ─── Chamada ao gateway (streaming) ──────────────────────────────────────────

function callGateway(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: "auto", stream: true });
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
        timeout: 120000,
      },
      (res) => {
        if (res.statusCode === 429) {
          return reject(new Error("Rate limited (429). Aguarde e tente novamente."));
        }
        if (res.statusCode !== 200) {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => reject(new Error(`Gateway ${res.statusCode}: ${data.slice(0, 200)}`)));
          return;
        }

        let fullContent = "";
        let toolCalls = [];
        let finishReason = null;
        let sseBuffer = "";

        res.on("data", (chunk) => {
          sseBuffer += chunk.toString();
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop();

          for (let line of lines) {
            line = line.trim();
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
            try {
              const data = JSON.parse(line.substring(6));
              const choice = data.choices?.[0];
              if (!choice) continue;

              if (choice.delta?.content) {
                fullContent += choice.delta.content;
                process.stdout.write(choice.delta.content);
              }

              if (choice.delta?.tool_calls) {
                for (const tc of choice.delta.tool_calls) {
                  if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id, function: { name: '', arguments: '' } };
                  if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                  if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
                }
              }

              if (choice.finish_reason) finishReason = choice.finish_reason;
            } catch {}
          }
        });

        res.on("end", () => {
          // Process remaining buffer
          if (sseBuffer.startsWith('data: ') && sseBuffer !== 'data: [DONE]') {
            try {
              const data = JSON.parse(sseBuffer.substring(6));
              const choice = data.choices?.[0];
              if (choice?.delta?.content) fullContent += choice.delta.content;
              if (choice?.finish_reason) finishReason = choice.finish_reason;
            } catch {}
          }

          resolve({
            choices: [{
              message: { content: fullContent, tool_calls: toolCalls.filter(Boolean) },
              finish_reason: finishReason || (toolCalls.length > 0 ? "tool_calls" : "stop"),
            }],
          });
        });
      }
    );

    req.on("timeout", () => { req.destroy(); reject(new Error("Gateway timeout (120s)")); });
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

  const projectCtx = getProjectContext();
  const systemContent = `Você é um agente CLI eficiente. Você tem acesso a ferramentas para explorar o sistema de arquivos, ler e escrever arquivos, executar comandos shell, e aplicar patches cirúrgicos em arquivos. Use-as proativamente para completar tarefas sem pedir informações ao usuário — pesquise, leia os arquivos relevantes e aja.
Para editar arquivos existentes, prefira patch_file (não reescreva o arquivo inteiro com write_file).
Diretório de trabalho: ${WORK_DIR}
${projectCtx ? `\nContexto do Projeto:\n${projectCtx}` : ''}`;

  const messages = [
    { role: "system", content: systemContent },
    { role: "user", content: PROMPT },
  ];

  // Git checkpoint before starting
  try { execSync("rtk git stash create", { cwd: WORK_DIR, encoding: "utf8" }); } catch {}

  for (let i = 1; i <= MAX_ITER; i++) {
    process.stdout.write(`\n${"─".repeat(40)}\n[iter ${i}/${MAX_ITER}] `);

    let response;
    try {
      response = await callGateway(messages);
    } catch (e) {
      if (e.message.includes('429')) {
        console.log(`\n⚠️ Rate limited. Aguardando 15s...`);
        await new Promise(r => setTimeout(r, 15000));
        i--; // retry
        continue;
      }
      console.error(`\n❌ Erro no gateway: ${e.message}`);
      process.exit(1);
    }

    const choice = response.choices?.[0];
    if (!choice) { console.error("\n❌ Resposta inesperada do gateway."); process.exit(1); }

    // Push assistant message
    if (choice.message.content) {
      messages.push({ role: "assistant", content: choice.message.content });
    }

    // Modelo quer chamar ferramentas
    if (choice.finish_reason === "tool_calls") {
      const toolCalls = choice.message.tool_calls || [];

      for (const call of toolCalls) {
        const { name, arguments: rawArgs } = call.function;
        process.stdout.write(`\n  🔧 ${name}(${rawArgs.length > 80 ? rawArgs.substring(0, 80) + '...' : rawArgs})`);
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
    console.log(`\n\n✅ Agente finalizou em ${i} iteração(ões).`);
    process.exit(0);
  }

  console.log(`\n⚠️  Limite de ${MAX_ITER} iterações atingido.`);
  process.exit(0);
}

agentLoop().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
