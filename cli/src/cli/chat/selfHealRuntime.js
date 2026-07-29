const fs = require("fs");
const path = require("path");
const { askRecoveryLLM } = require("./recoveryClient");
const { logAudit, createGitCheckpoint, rollbackGitCheckpoint } = require("./patchEngine");

const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const MAX_HEAL_ATTEMPTS = 3;

/**
 * Parse a Node.js stack trace to extract file paths and line numbers.
 * @param {string} stack
 * @returns {Array<{file: string, line: number}>}
 */
function parseStackTrace(stack) {
  const frames = [];
  const regex = /at\s+(?:(.+?)\s+\()?(.+?):(\d+):\d+\)?/g;
  let match;
  while ((match = regex.exec(stack)) !== null) {
    const file = match[2];
    const line = parseInt(match[3], 10);
    // Only include files inside the project (not node_modules)
    if (file && !file.includes("node_modules") && !file.startsWith("node:")) {
      frames.push({ file, line });
    }
  }
  return frames;
}

/**
 * Read a window of source code around a specific line.
 */
function readSourceWindow(filePath, centerLine, windowSize = 40) {
  try {
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absPath)) return null;
    const lines = fs.readFileSync(absPath, "utf8").split("\n");
    const start = Math.max(0, centerLine - windowSize);
    const end = Math.min(lines.length, centerLine + windowSize);
    const numbered = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join("\n");
    return { content: numbered, startLine: start + 1, filePath: absPath };
  } catch { return null; }
}

/**
 * Parse a <patch> block from the LLM response.
 * @param {string} content
 * @returns {{file: string, oldCode: string, newCode: string}[]}
 */
function parsePatchBlocks(content) {
  const patches = [];
  const regex = /<patch\s+path="([^"]+)">([\s\S]*?)<\/patch>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const filePath = match[1];
    const patchBody = match[2];
    // Split on ---old--- and +++new+++
    const oldMatch = patchBody.match(/---old---\s*\n([\s\S]*?)\n\s*\+\+\+new\+\+\+/);
    const newMatch = patchBody.match(/\+\+\+new\+\+\+\s*\n([\s\S]*?)$/);
    if (oldMatch && newMatch) {
      patches.push({
        file: path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath),
        oldCode: oldMatch[1].trim(),
        newCode: newMatch[1].trim()
      });
    }
  }
  return patches;
}

/**
 * Parse a <file> block (full file replacement).
 */
function parseFileBlocks(content) {
  const files = [];
  const regex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    files.push({
      file: path.isAbsolute(match[1]) ? match[1] : path.resolve(process.cwd(), match[1]),
      newCode: match[2]
    });
  }
  return files;
}

/**
 * Apply a single patch using exact or whitespace-normalized match.
 */
function applyPatch(patch) {
  try {
    if (!fs.existsSync(patch.file)) return false;
    let content = fs.readFileSync(patch.file, "utf8");

    // Try exact match
    if (content.includes(patch.oldCode)) {
      content = content.replace(patch.oldCode, patch.newCode);
      fs.writeFileSync(patch.file, content, "utf8");
      return true;
    }

    // Fuzzy match: normalize whitespace
    const normalize = s => s.replace(/\s+/g, " ").trim();
    const contentNorm = normalize(content);
    const oldNorm = normalize(patch.oldCode);

    if (contentNorm.includes(oldNorm)) {
      // Find the real boundaries in the original content
      const lines = content.split("\n");
      const oldLines = patch.oldCode.split("\n").map(l => l.trim()).filter(Boolean);

      let bestStart = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === oldLines[0]) {
          let match = true;
          for (let j = 1; j < oldLines.length; j++) {
            if (!lines[i + j] || lines[i + j].trim() !== oldLines[j]) { match = false; break; }
          }
          if (match) { bestStart = i; break; }
        }
      }

      if (bestStart >= 0) {
        const before = lines.slice(0, bestStart).join("\n");
        const after = lines.slice(bestStart + oldLines.length).join("\n");
        const newContent = before + (before ? "\n" : "") + patch.newCode + "\n" + after;
        fs.writeFileSync(patch.file, newContent.trimEnd() + "\n", "utf8");
        return true;
      }
    }

    return false;
  } catch { return false; }
}

/**
 * The Wolverine loop: detect crash, ask LLM to fix, apply patch, return.
 * @param {string} errorLog - Stack trace or stderr output
 * @param {string} [context] - "server" or "cli"
 * @returns {Promise<boolean>} true if a fix was successfully applied
 */
async function selfHeal(errorLog, context = "cli") {
  console.log(`\n${CYAN}🧟 [Wolverine Mode] Auto-correção ativada...${RESET}`);
  logAudit("WOLVERINE_HEAL_START", { context, errorPreview: errorLog.substring(0, 500) });

  const frames = parseStackTrace(errorLog);
  if (frames.length === 0) {
    console.log(`${RED}✖ Não foi possível localizar o arquivo no stack trace.${RESET}`);
    return false;
  }

  // Try to read the source code around the first relevant frame
  let sourceContext = "";
  for (const frame of frames.slice(0, 3)) {
    const window = readSourceWindow(frame.file, frame.line, 40);
    if (window) {
      sourceContext += `\n--- ${window.filePath} (around line ${frame.line}) ---\n${window.content}\n`;
      break;
    }
  }

  if (!sourceContext) {
    console.log(`${RED}✖ Arquivos de origem não encontrados no disco.${RESET}`);
    return false;
  }

  createGitCheckpoint();

  for (let attempt = 1; attempt <= MAX_HEAL_ATTEMPTS; attempt++) {
    console.log(`${DIM}  Tentativa ${attempt}/${MAX_HEAL_ATTEMPTS}...${RESET}`);

    try {
      const prompt = [
        {
          role: "system",
          content: `Você é um agente de auto-correção de software (Wolverine Mode). Uma aplicação Node.js (HiperRouter) crashou.

REGRAS:
1. Analise o stack trace e o código fonte fornecido.
2. Encontre o bug e gere a correção usando EXCLUSIVAMENTE a tag <patch> no formato abaixo:
<patch path="caminho/do/arquivo.js">
---old---
código antigo (exatamente como aparece no arquivo)
+++new+++
código corrigido
</patch>
3. O código antigo DEVE existir EXATAMENTE no arquivo (copie da amostra fornecida).
4. Se precisar reescrever o arquivo inteiro, use <file path="...">conteúdo completo</file>.
5. Seja conciso. Corrija apenas o bug, não reescreva nada além do necessário.
6. NÃO explique. Retorne APENAS os blocos <patch> ou <file>.`
        },
        {
          role: "user",
          content: `O sistema crashou com este erro:\n\`\`\`\n${errorLog.substring(0, 4000)}\n\`\`\`\n\nCódigo fonte ao redor do erro:\n\`\`\`\n${sourceContext.substring(0, 8000)}\n\`\`\`\n\nCorrija o bug.`
        }
      ];

      const response = await askRecoveryLLM(prompt);

      // Parse patches from response
      const patches = parsePatchBlocks(response);
      const fileBlocks = parseFileBlocks(response);

      if (patches.length === 0 && fileBlocks.length === 0) {
        console.log(`${RED}  ✖ A IA não gerou nenhum patch válido.${RESET}`);
        continue;
      }

      // Apply file blocks first (full rewrites)
      for (const fb of fileBlocks) {
        console.log(`${DIM}  Reescrevendo ${fb.file}...${RESET}`);
        fs.writeFileSync(fb.file, fb.newCode, "utf8");
        logAudit("WOLVERINE_FILE_REWRITE", { file: fb.file });
      }

      // Apply patches
      let allPatched = true;
      for (const p of patches) {
        const success = applyPatch(p);
        if (success) {
          console.log(`${GREEN}  ✔ Patch aplicado: ${p.file}${RESET}`);
          logAudit("WOLVERINE_PATCH_APPLIED", { file: p.file });
        } else {
          console.log(`${RED}  ✖ Falha ao aplicar patch: ${p.file}${RESET}`);
          allPatched = false;
        }
      }

      if (allPatched || fileBlocks.length > 0) {
        console.log(`${GREEN}🧟 [Wolverine Mode] Auto-correção concluída com sucesso.${RESET}`);
        return true;
      }
    } catch (err) {
      console.log(`${RED}  ✖ Erro ao consultar LLM: ${err.message}${RESET}`);
      logAudit("WOLVERINE_LLM_ERROR", { error: err.message });
    }
  }

  rollbackGitCheckpoint();
  console.log(`${RED}🧟 [Wolverine Mode] Falha após ${MAX_HEAL_ATTEMPTS} tentativas. Rollback aplicado.${RESET}`);
  logAudit("WOLVERINE_HEAL_FAILED", {});
  return false;
}

module.exports = { selfHeal };
