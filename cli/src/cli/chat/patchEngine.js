const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const { COLORS, confirmWithAuto } = require("../utils/input");
const { renderDiffPreview } = require("../utils/display");

/**
 * Dispara graphify update em background (fire-and-forget).
 * Não bloqueia a execução — ~3s economizados por patch.
 */
function graphifyUpdateAsync() {
  try {
    spawn("rtk", ["graphify", "update", "."], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch (e) { /* ignore */ }
}

let lastGitCheckpoint = null;

function logAudit(action, details = {}) {
  try {
    const { getCliDataDir } = require("../constants");
    const auditDir = getCliDataDir();
    if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
    const logPath = path.join(auditDir, "audit.log");
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      pid: process.pid,
      cwd: process.cwd(),
      ...details
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch (e) { if (process.env.DEBUG) console.warn("[audit] write failed:", e.message); }
}

function createGitCheckpoint() {
  try {
    const stash = execSync("rtk git stash create 2>/dev/null", { encoding: "utf8" }).trim();
    if (stash) lastGitCheckpoint = stash;
  } catch (e) { if (process.env.DEBUG) console.warn("[checkpoint] git stash create failed:", e.message); }
}

function rollbackGitCheckpoint() {
  logAudit("ROLLBACK_REQUESTED", { checkpoint: lastGitCheckpoint });
  if (lastGitCheckpoint) {
    try {
      execSync(`rtk git reset --hard ${lastGitCheckpoint}`, { stdio: "ignore" });
      return true;
    } catch (e) { if (process.env.DEBUG) console.warn("[rollback] git reset failed:", e.message); }
  }
  try {
    execSync("rtk git checkout .", { stdio: "ignore" });
    return true;
  } catch (e) {
    if (process.env.DEBUG) console.warn("[rollback] git checkout failed:", e.message);
    return false;
  }
}

// --- SAFETY HELPERS ---

/**
 * Cria backup rotativo (.bak.1, .bak.2, ..., .bak.N).
 * Preserva os últimos N backups em vez de sobrescrever o único .bak.
 * @param {string} fullPath - Caminho absoluto do arquivo
 * @param {number} maxBackups - Número máximo de backups a manter (default: 5)
 * @returns {string} Caminho do backup criado
 */
function createRotatingBackup(fullPath, maxBackups = 5) {
  let nextNum = 1;
  for (let i = 1; i <= maxBackups; i++) {
    if (!fs.existsSync(`${fullPath}.bak.${i}`)) {
      nextNum = i;
      break;
    }
    nextNum = i + 1;
  }
  // Se excedeu o máximo, rotaciona: deleta o mais antigo, desloca os demais
  if (nextNum > maxBackups) {
    try { fs.unlinkSync(`${fullPath}.bak.1`); } catch (e) { /* ignore */ }
    for (let i = 2; i <= maxBackups; i++) {
      try { fs.renameSync(`${fullPath}.bak.${i}`, `${fullPath}.bak.${i - 1}`); } catch (e) { /* ignore */ }
    }
    nextNum = maxBackups;
  }
  const backupPath = `${fullPath}.bak.${nextNum}`;
  fs.copyFileSync(fullPath, backupPath);
  return backupPath;
}

/**
 * Valida sintaxe de arquivo JS/JSON após patch.
 * @param {string} fullPath
 * @returns {{valid: boolean, error?: string}}
 */
function validateSyntaxPostPatch(fullPath) {
  const ext = path.extname(fullPath).toLowerCase();

  // JS/MJS/CJS: node -c (syntax check)
  if (['.js', '.mjs', '.cjs'].includes(ext)) {
    try {
      execSync(`node -c ${JSON.stringify(fullPath)}`, { encoding: 'utf8', stdio: 'pipe' });
      return { valid: true };
    } catch (e) {
      return { valid: false, error: (e.stderr || e.stdout || e.message || '').toString().substring(0, 1500) };
    }
  }

  // JSON: try parse
  if (ext === '.json') {
    try {
      JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  // Outros tipos (.ts, .tsx, .css, .html): não valida aqui (TS é validado pelo auto-guardrail do bashExecutor)
  return { valid: true };
}

/**
 * Conta ocorrências exatas de uma substring em um texto.
 * @param {string} text
 * @param {string} substring
 * @returns {number}
 */
function countOccurrences(text, substring) {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(substring, pos)) !== -1) {
    count++;
    pos += substring.length;
  }
  return count;
}

/**
 * Mostra contexto (linhas ao redor) de um trecho encontrado no arquivo.
 * @param {string} content - Conteúdo completo do arquivo
 * @param {string} matchedText - Texto que casou
 * @param {number} startPos - Posição inicial no conteúdo
 * @param {number} contextLines - Linhas de contexto (default: 2)
 */
function showMatchContext(content, matchedText, startPos, contextLines = 2) {
  const allLines = content.split('\n');
  const beforeText = content.substring(0, startPos);
  const lineNum = beforeText.split('\n').length;
  const matchLines = matchedText.split('\n');

  const startLine = Math.max(0, lineNum - 1 - contextLines);
  const endLine = Math.min(allLines.length, lineNum - 1 + matchLines.length + contextLines);

  for (let i = startLine; i < endLine; i++) {
    const isMatch = i >= lineNum - 1 && i < lineNum - 1 + matchLines.length;
    const lineLabel = String(i + 1).padStart(4, ' ');
    if (isMatch) {
      console.log(`\x1b[33m  ${lineLabel} │ ${allLines[i]}\x1b[0m`);
    } else {
      console.log(`\x1b[2m  ${lineLabel} │ ${allLines[i]}\x1b[0m`);
    }
  }
}

async function processPatches(aiFullMessage, messages) {
  const patchMatches = [...aiFullMessage.matchAll(/<patch\s+path="([^"]+)">\s*<<<<\n([\s\S]*?)\n====\n([\s\S]*?)\n>>>>\s*<\/patch>/g)];
  let aiThinking = false;

  if (patchMatches.length === 0) return { aiThinking };

  // --- ATOMIC BATCH: Parse all patches first ---
  const patches = patchMatches.map(m => ({
    filePath: m[1].trim(),
    oldCode: m[2],
    newCode: m[3],
    fullPath: path.resolve(process.cwd(), m[1].trim()),
  }));

  // Security check: all paths must be inside project
  for (const p of patches) {
    if (!p.fullPath.startsWith(process.cwd() + path.sep)) {
      console.log(`${COLORS.red}⛔ Patch bloqueado: '${p.filePath}' está fora do diretório do projeto.${COLORS.reset}\n`);
      return { aiThinking: false };
    }
  }

  // Show all diffs and get confirmation
  for (const p of patches) {
    renderDiffPreview(p.oldCode, p.newCode, p.filePath);
  }

  if (patches.length > 1) {
    console.log(`\n${COLORS.cyan}📦 Batch de ${patches.length} patches detectado. Todos serão aplicados atomicamente.${COLORS.reset}`);
  }

  const shouldWrite = patches.length === 1
    ? await confirmWithAuto(`\n${COLORS.yellow}Aplicar Patch Cirúrgico no arquivo '${patches[0].filePath}'?${COLORS.reset}`, "patch:" + patches[0].filePath)
    : await confirmWithAuto(`\n${COLORS.yellow}Aplicar ${patches.length} patches atomicamente? (Se qualquer um falhar, todos revertem)${COLORS.reset}`, "patch:batch");

  if (typeof shouldWrite === 'string') {
    messages.push({ role: "assistant", content: aiFullMessage });
    messages.push({ role: "user", content: `(O usuário rejeitou os patches e enviou este feedback: "${shouldWrite}")` });
    return { aiThinking: true };
  }
  if (!shouldWrite) return { aiThinking: false };

  // --- Phase 1: Create backups for ALL files ---
  createGitCheckpoint();
  const backups = new Map(); // fullPath -> backupPath
  const originalContents = new Map(); // fullPath -> original content

  for (const p of patches) {
    try {
      const content = fs.readFileSync(p.fullPath, "utf-8");
      originalContents.set(p.fullPath, content);
      const backupPath = createRotatingBackup(p.fullPath);
      backups.set(p.fullPath, backupPath);
    } catch (e) {
      console.log(`${COLORS.red}❌ Erro ao fazer backup de '${p.filePath}': ${e.message}${COLORS.reset}`);
      // Rollback already-created backups
      for (const [fp, bak] of backups) {
        try { fs.copyFileSync(bak, fp); } catch {}
      }
      return { aiThinking: false };
    }
  }

  // --- Phase 2: Apply all patches ---
  const appliedFiles = [];
  let failedPatch = null;

  for (const p of patches) {
    let content = originalContents.get(p.fullPath);
    let matched = false;

    if (content.includes(p.oldCode)) {
      // Exact match
      const occurrences = countOccurrences(content, p.oldCode);
      if (occurrences > 1) {
        console.log(`\n${COLORS.yellow}⚠️  '${p.filePath}': código antigo aparece ${occurrences}x. Aplicando na 1ª ocorrência.${COLORS.reset}`);
        const firstPos = content.indexOf(p.oldCode);
        showMatchContext(content, p.oldCode, firstPos, 2);
      }
      content = content.replace(p.oldCode, p.newCode);
      matched = true;
    } else {
      // Fuzzy match
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let fuzzyPattern = escapeRegex(p.oldCode).replace(/\s+/g, '\\s+');
      fuzzyPattern = fuzzyPattern.replace(/^\\s\+/, '\\s*').replace(/\\s\+$/, '\\s*');
      const regex = new RegExp(fuzzyPattern);
      if (regex.test(content)) {
        content = content.replace(regex, p.newCode);
        matched = true;
        console.log(`${COLORS.dim}  ✅ '${p.filePath}': Fuzzy match${COLORS.reset}`);
      }
    }

    if (!matched) {
      failedPatch = p;
      console.log(`${COLORS.red}  ❌ '${p.filePath}': código antigo não encontrado${COLORS.reset}`);
      break;
    }

    fs.writeFileSync(p.fullPath, content);
    appliedFiles.push(p.fullPath);
    logAudit("PATCH_APPLIED", { file: p.filePath, method: "atomic-batch" });
  }

  // --- Phase 3: Validate ALL applied patches ---
  let validationFailed = null;
  if (!failedPatch) {
    for (const fp of appliedFiles) {
      const validation = validateSyntaxPostPatch(fp);
      if (!validation.valid) {
        validationFailed = { file: fp, error: validation.error };
        break;
      }
    }
  }

  // --- Phase 4: Rollback ALL if any failed ---
  if (failedPatch || validationFailed) {
    console.log(`\n${COLORS.red}❌ PATCH ATÔMICO FALHOU — Revertendo TODOS os ${appliedFiles.length} patches...${COLORS.reset}`);

    for (const [fp, bak] of backups) {
      try { fs.copyFileSync(bak, fp); } catch {}
    }

    if (validationFailed) {
      console.log(`${COLORS.red}Erro de sintaxe em '${validationFailed.file}':${COLORS.reset}`);
      console.log(`${COLORS.dim}${validationFailed.error}${COLORS.reset}\n`);
      logAudit("PATCH_ATOMIC_ROLLBACK", { reason: "syntax_error", file: validationFailed.file });
      messages.push({
        role: 'system',
        content: `⚠️ ALERTA: Batch de ${patches.length} patches foi REVERTIDO porque '${validationFailed.file}' gerou erro de sintaxe:\n\`\`\`\n${validationFailed.error}\n\`\`\`\nRevise o código e gere patches corretos.`
      });
    } else {
      const snippet = originalContents.get(failedPatch.fullPath) || "";
      const lastLines = snippet.length > 6000 ? snippet.slice(-6000) : snippet;
      const prefix = snippet.length > 6000 ? "...[trecho anterior omitido]...\n" : "";
      logAudit("PATCH_ATOMIC_ROLLBACK", { reason: "match_failed", file: failedPatch.filePath });
      messages.push({
        role: "system",
        content: `⚠️ AUTO-HEAL (patch falhou): O patch no arquivo '${failedPatch.filePath}' não pôde ser aplicado — o código antigo não existe no arquivo.\n\nConteúdo atual:\n\`\`\`\n${prefix}${lastLines}\n\`\`\`\nGere um novo patch correto.`
      });
    }

    return { aiThinking: true };
  }

  // --- Success ---
  for (const p of patches) {
    console.log(`${COLORS.green}✅ Patch aplicado: ${p.filePath} ${COLORS.dim}(backup: ${path.basename(backups.get(p.fullPath))})${COLORS.reset}`);
  }
  if (patches.length > 1) {
    console.log(`${COLORS.green}📦 ${patches.length} patches aplicados atomicamente com sucesso!${COLORS.reset}`);
  }
  console.log();
  graphifyUpdateAsync();

  return { aiThinking: false };
}

async function processNewFiles(aiFullMessage, messages) {
  const fileMatches = [...aiFullMessage.matchAll(/<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g)];
  let aiThinking = false;

  for (const match of fileMatches) {
    const filePath = match[1].trim();
    const fileContent = match[2].trim();

    // --- FIX #5: Overwrite Guard ---
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fullPath.startsWith(process.cwd() + path.sep)) {
      console.log(`${COLORS.red}⛔ Criação bloqueada: '${filePath}' está fora do diretório do projeto.${COLORS.reset}\n`);
      continue;
    }

    const fileExists = fs.existsSync(fullPath);
    let confirmMsg;
    if (fileExists) {
      const existingSize = fs.statSync(fullPath).size;
      confirmMsg = `\n${COLORS.yellow}⚠️  SOBRESCREVER arquivo existente '${filePath}' (${existingSize} bytes)?${COLORS.reset}`;
    } else {
      confirmMsg = `\n${COLORS.yellow}Salvar novo arquivo '${filePath}'?${COLORS.reset}`;
    }

    const shouldWrite = await confirmWithAuto(confirmMsg, "file:" + filePath);
    if (typeof shouldWrite === 'string') {
      messages.push({ role: "assistant", content: aiFullMessage });
      messages.push({ role: "user", content: `(O usuário rejeitou a criação do arquivo '${filePath}' e disse: "${shouldWrite}")` });
      aiThinking = true;
      break;
    } else if (shouldWrite) {
      try {
        // Backup rotativo se arquivo já existe
        if (fileExists) {
          const backupPath = createRotatingBackup(fullPath);
          console.log(`${COLORS.dim}[Backup do arquivo existente: ${path.basename(backupPath)}]${COLORS.reset}`);
          logAudit("FILE_OVERWRITE_BACKUP", { file: filePath, backup: backupPath });
        }
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, fileContent);

        // Validação pós-escrita
        const validation = validateSyntaxPostPatch(fullPath);
        if (!validation.valid) {
          // Se temos backup, restaurar
          if (fileExists) {
            // Encontra o backup mais recente
            for (let i = 5; i >= 1; i--) {
              const bak = `${fullPath}.bak.${i}`;
              if (fs.existsSync(bak)) {
                fs.copyFileSync(bak, fullPath);
                break;
              }
            }
            console.log(`${COLORS.red}❌ [Auto-Guardrail] Arquivo gerou erro de sintaxe! Restaurando backup.${COLORS.reset}`);
          } else {
            fs.unlinkSync(fullPath);
            console.log(`${COLORS.red}❌ [Auto-Guardrail] Arquivo novo gerou erro de sintaxe! Removido.${COLORS.reset}`);
          }
          console.log(`${COLORS.dim}Erro: ${validation.error}${COLORS.reset}\n`);
          messages.push({
            role: 'system',
            content: `⚠️ ALERTA: O arquivo '${filePath}' gerou erro de sintaxe e foi revertido:\n\`\`\`\n${validation.error}\n\`\`\`\nCorrija o código e tente novamente.`
          });
          aiThinking = true;
          break;
        }

        console.log(`${COLORS.green}✅ Arquivo ${fileExists ? 'sobrescrito' : 'criado'}!${COLORS.reset}\n`);
        graphifyUpdateAsync();
      } catch (err) {
        console.log(`${COLORS.red}Erro ao salvar: ${err.message}${COLORS.reset}\n`);
      }
    }
  }

  return { aiThinking };
}

module.exports = {
  logAudit,
  createGitCheckpoint,
  rollbackGitCheckpoint,
  createRotatingBackup,
  validateSyntaxPostPatch,
  processPatches,
  processNewFiles,
};
