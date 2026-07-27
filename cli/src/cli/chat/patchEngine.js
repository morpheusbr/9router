const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { COLORS, confirmWithAuto } = require("../utils/input");
const { renderDiffPreview } = require("../utils/display");

let lastGitCheckpoint = null;

function logAudit(action, details = {}) {
  try {
    const auditDir = path.resolve(__dirname, "../../../..", ".HiperRouter");
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
          fs.copyFileSync(fullPath, fullPath + '.bak');
          content = content.replace(oldCode, newCode);
          fs.writeFileSync(fullPath, content);
          console.log(`${COLORS.green}✅ Patch cirúrgico aplicado com Match Exato! ${COLORS.dim}(backup em ${filePath}.bak — use /undo para reverter)${COLORS.reset}\n`);
          try { execSync("rtk graphify update .", { cwd: process.cwd(), stdio: "ignore" }); } catch(e) {}
        } else {
          // --- FUZZY MATCHING (Whitespace-Agnostic) ---
          console.log(`${COLORS.yellow}⚠️ Match exato falhou. Tentando Fuzzy Match (ignorando quebras de linha e espaços)...${COLORS.reset}`);
          const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Substitui blocos de espaços/quebras por \s+ (1 ou mais espaços)
          let fuzzyPattern = escapeRegex(oldCode).replace(/\s+/g, '\\s+');
          // Permite que os espaços no começo e fim sejam opcionais
          fuzzyPattern = fuzzyPattern.replace(/^\\s\+/, '\\s*').replace(/\\s\+$/, '\\s*');
          
          const regex = new RegExp(fuzzyPattern);
          
          if (regex.test(content)) {
            fs.copyFileSync(fullPath, fullPath + '.bak');
            content = content.replace(regex, newCode);
            fs.writeFileSync(fullPath, content);
            console.log(`${COLORS.green}✅ Patch cirúrgico salvo via Fuzzy Match! ${COLORS.dim}(backup em ${filePath}.bak — use /undo para reverter)${COLORS.reset}\n`);
            try { execSync("rtk graphify update .", { cwd: process.cwd(), stdio: "ignore" }); } catch(e) {}
          } else {
            console.log(`${COLORS.red}⛔ Falha Crítica: O código 'antigo' não foi encontrado nem com Fuzzy Match. A IA gerou um bloco que não existe no arquivo.${COLORS.reset}\n`);
          }
        }
      } catch (e) {
        console.log(`${COLORS.red}Erro: ${e.message}${COLORS.reset}`);
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
    const shouldWrite = await confirmWithAuto(`\n${COLORS.yellow}Salvar novo arquivo '${filePath}'?${COLORS.reset}`, "file:" + filePath);
    if (typeof shouldWrite === 'string') {
      messages.push({ role: "assistant", content: aiFullMessage });
      messages.push({ role: "user", content: `(O usuário rejeitou a criação do arquivo '${filePath}' e disse: "${shouldWrite}")` });
      aiThinking = true;
      break;
    } else if (shouldWrite) {
      try {
        const fullPath = path.resolve(process.cwd(), filePath);
        if (!fullPath.startsWith(process.cwd() + path.sep)) {
          console.log(`${COLORS.red}⛔ Criação bloqueada: '${filePath}' está fora do diretório do projeto.${COLORS.reset}\n`);
          continue;
        }
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, fileContent);
        console.log(`${COLORS.green}✅ Arquivo criado!${COLORS.reset}\n`);
        try { execSync("rtk graphify update .", { cwd: process.cwd(), stdio: "ignore" }); } catch (err) {}
      } catch (err) {}
    }
  }

  return { aiThinking };
}

module.exports = {
  logAudit,
  createGitCheckpoint,
  rollbackGitCheckpoint,
  processPatches,
  processNewFiles,
};
