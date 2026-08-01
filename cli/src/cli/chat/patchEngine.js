const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { COLORS, confirmWithAuto } = require("../utils/input");
const { renderDiffPreview } = require("../utils/display");

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
  } catch (e) {}
}

function createGitCheckpoint() {
  try {
    const stash = execSync("rtk git stash create 2>/dev/null", { encoding: "utf8" }).trim();
    if (stash) lastGitCheckpoint = stash;
  } catch (e) {}
}

function rollbackGitCheckpoint() {
  logAudit("ROLLBACK_REQUESTED", { checkpoint: lastGitCheckpoint });
  if (lastGitCheckpoint) {
    try {
      execSync(`rtk git reset --hard ${lastGitCheckpoint}`, { stdio: "ignore" });
      return true;
    } catch (e) {}
  }
  try {
    execSync("rtk git checkout .", { stdio: "ignore" });
    return true;
  } catch (e) {
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

  for (const match of patchMatches) {
    const filePath = match[1].trim();
    const oldCode = match[2];
    const newCode = match[3];

    renderDiffPreview(oldCode, newCode, filePath);

    createGitCheckpoint();
    logAudit("PATCH_APPLIED", { file: filePath });

    const shouldWrite = await confirmWithAuto(`\n${COLORS.yellow}Aplicar Patch Cirúrgico no arquivo '${filePath}'?${COLORS.reset}`, "patch:" + filePath);
    if (typeof shouldWrite === 'string') {
      messages.push({ role: "assistant", content: aiFullMessage });
      messages.push({ role: "user", content: `(O usuário rejeitou o patch no arquivo '${filePath}' e enviou este feedback: "${shouldWrite}")` });
      aiThinking = true;
      break;
    } else if (shouldWrite) {
      try {
        const fullPath = path.resolve(process.cwd(), filePath);
        if (!fullPath.startsWith(process.cwd() + path.sep)) {
          console.log(`${COLORS.red}⛔ Patch bloqueado: '${filePath}' está fora do diretório do projeto.${COLORS.reset}\n`);
          continue;
        }
        let content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes(oldCode)) {
          // --- FIX #1: Multi-Match Detection ---
          const occurrences = countOccurrences(content, oldCode);
          if (occurrences > 1) {
            console.log(`\n${COLORS.yellow}⚠️  ATENÇÃO: O código antigo aparece ${occurrences}x no arquivo!${COLORS.reset}`);
            console.log(`${COLORS.dim}O patch será aplicado apenas na PRIMEIRA ocorrência. Contexto:${COLORS.reset}`);
            const firstPos = content.indexOf(oldCode);
            showMatchContext(content, oldCode, firstPos, 2);
            console.log(`${COLORS.dim}Se não for o trecho correto, rejeite (n) e peça à IA para incluir mais contexto.${COLORS.reset}\n`);
          }

          // --- FIX #2: Backup Rotativo ---
          const backupPath = createRotatingBackup(fullPath);
          content = content.replace(oldCode, newCode);
          fs.writeFileSync(fullPath, content);

          // --- FIX #3: Validação Pós-Patch ---
          const validation = validateSyntaxPostPatch(fullPath);
          if (!validation.valid) {
            // Auto-rollback: restaura o backup
            fs.copyFileSync(backupPath, fullPath);
            console.log(`${COLORS.red}❌ [Auto-Guardrail] Patch gerou erro de sintaxe! Revertendo automaticamente.${COLORS.reset}`);
            console.log(`${COLORS.dim}Erro: ${validation.error}${COLORS.reset}\n`);
            logAudit("PATCH_SYNTAX_ROLLBACK", { file: filePath, error: validation.error });
            messages.push({
              role: 'system',
              content: `⚠️ ALERTA: O patch em '${filePath}' foi REVERTIDO porque gerou erro de sintaxe:\n\`\`\`\n${validation.error}\n\`\`\`\nRevise o código e gere um patch correto.`
            });
            aiThinking = true;
            break;
          }

          console.log(`${COLORS.green}✅ Patch cirúrgico aplicado com Match Exato! ${COLORS.dim}(backup: ${path.basename(backupPath)} — use /undo para reverter)${COLORS.reset}\n`);
          try { execSync("rtk graphify update .", { cwd: process.cwd(), stdio: "ignore" }); } catch(e) {}
        } else {
          // --- FUZZY MATCHING (Whitespace-Agnostic) ---
          console.log(`${COLORS.yellow}⚠️ Match exato falhou. Tentando Fuzzy Match (ignorando quebras de linha e espaços)...${COLORS.reset}`);
          const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          let fuzzyPattern = escapeRegex(oldCode).replace(/\s+/g, '\\s+');
          fuzzyPattern = fuzzyPattern.replace(/^\\s\+/, '\\s*').replace(/\\s\+$/, '\\s*');
          
          const regex = new RegExp(fuzzyPattern);
          const fuzzyMatch = content.match(regex);
          
          if (fuzzyMatch) {
            // --- FIX #4: Fuzzy Match Visual Confirmation ---
            const fuzzyPos = content.indexOf(fuzzyMatch[0]);
            const fuzzyLineNum = content.substring(0, fuzzyPos).split('\n').length;
            console.log(`\n${COLORS.yellow}📍 Fuzzy Match encontrado na linha ~${fuzzyLineNum}:${COLORS.reset}`);
            showMatchContext(content, fuzzyMatch[0], fuzzyPos, 2);
            console.log();

            const backupPath = createRotatingBackup(fullPath);
            content = content.replace(regex, newCode);
            fs.writeFileSync(fullPath, content);

            // Validação pós-patch
            const validation = validateSyntaxPostPatch(fullPath);
            if (!validation.valid) {
              fs.copyFileSync(backupPath, fullPath);
              console.log(`${COLORS.red}❌ [Auto-Guardrail] Fuzzy patch gerou erro de sintaxe! Revertendo.${COLORS.reset}`);
              console.log(`${COLORS.dim}Erro: ${validation.error}${COLORS.reset}\n`);
              logAudit("PATCH_SYNTAX_ROLLBACK", { file: filePath, error: validation.error, method: "fuzzy" });
              messages.push({
                role: 'system',
                content: `⚠️ ALERTA: O patch fuzzy em '${filePath}' foi REVERTIDO porque gerou erro de sintaxe:\n\`\`\`\n${validation.error}\n\`\`\`\nRevise o código e gere um patch correto.`
              });
              aiThinking = true;
              break;
            }

            console.log(`${COLORS.green}✅ Patch cirúrgico salvo via Fuzzy Match! ${COLORS.dim}(backup: ${path.basename(backupPath)} — use /undo para reverter)${COLORS.reset}\n`);
            try { execSync("rtk graphify update .", { cwd: process.cwd(), stdio: "ignore" }); } catch(e) {}
          } else {
            console.log(`${COLORS.red}⛔ Falha Crítica: O código 'antigo' não foi encontrado nem com Fuzzy Match. A IA gerou um bloco que não existe no arquivo.${COLORS.reset}`);
            // Self-Healing: send file content back to LLM so it can rewrite the patch
            const snippet = content.length > 6000 ? content.slice(-6000) : content;
            const snippetPrefix = content.length > 6000 ? "...[trecho anterior omitido]...\n" : "";
            messages.push({
              role: "system",
              content: `⚠️ AUTO-HEAL (patch falhou): O patch no arquivo '${filePath}' não pôde ser aplicado — o código antigo que você forneceu não existe no arquivo atual.\n\nConteúdo atual do arquivo (últimas ~200 linhas):\n\`\`\`\n${snippetPrefix}${snippet}\n\`\`\`\n\nAnalise o conteúdo acima, gere um novo patch correto com o bloco 'antigo' que REALMENTE existe no arquivo, e tente novamente.`
            });
            logAudit("PATCH_FUZZY_FAILED", { file: filePath });
            aiThinking = true;
            break;
          }
        }
      } catch (e) {
        console.log(`${COLORS.red}Erro: ${e.message}${COLORS.reset}`);
        messages.push({
          role: "system",
          content: `⚠️ AUTO-HEAL (erro ao aplicar patch): Patch no arquivo '${filePath}' falhou com erro: ${e.message}\nCorrija o problema e tente novamente.`
        });
        aiThinking = true;
        break;
      }
    }
  }

  return { aiThinking };
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
        try { execSync("rtk graphify update .", { cwd: process.cwd(), stdio: "ignore" }); } catch (err) {}
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
