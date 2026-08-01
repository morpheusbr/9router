const fs = require("fs");
const path = require("path");
const configStore = require("./configStore");
const { prompt } = require("./input");

const autoApprovedCommands = new Set();

function getActionPrefix(actionKey) {
  if (!actionKey) return "";
  if (actionKey.startsWith("patch:") || actionKey.startsWith("file:")) return actionKey;
  return actionKey.trim().split(/\s+/).slice(0, 3).join(" ");
}

async function confirmWithAuto(question, actionKey) {
  const approvalMode = configStore.get("autoApproveMode", "ask");

  if (approvalMode === "all") return true;
  if (approvalMode === "patches" && (actionKey.startsWith("patch:") || actionKey.startsWith("file:"))) return true;

  const prefixKey = getActionPrefix(actionKey);
  if (autoApprovedCommands.has(actionKey) || autoApprovedCommands.has(prefixKey)) return true;

  while (true) {
    const answer = await prompt(`${question} (y/n/s/t): `);
    const lower = answer.toLowerCase();
    if (lower === "y" || lower === "yes" || lower === "sim") return true;
    if (lower === "n" || lower === "no" || lower === "nao" || lower === "não") return false;
    if (lower === "s" || lower === "sempre" || lower === "similar") {
      autoApprovedCommands.add(actionKey);
      if (prefixKey) autoApprovedCommands.add(prefixKey);
      return true;
    }
    if (lower === "t" || lower === "texto") {
      const txt = await prompt(`\x1b[36mDigite o feedback/texto para a IA:\x1b[0m `);
      return txt;
    }
    console.log("Responda 'y' (sim), 'n' (não), 's' (sempre) ou 't' (enviar texto/feedback).");
  }
}

function findUp(filename, startDir) {
  let currDir = startDir;
  while (true) {
    const filePath = path.join(currDir, filename);
    if (fs.existsSync(filePath)) return filePath;
    const parentDir = path.dirname(currDir);
    if (parentDir === currDir) return null;
    currDir = parentDir;
  }
}

function getProjectContext() {
  let context = "";
  try {
    const agentsPath = findUp("AGENTS.md", process.cwd());
    if (agentsPath) {
      context += "--- REGRAS GLOBAIS DE ENGENHARIA (AGENTS.md) ---\n" + fs.readFileSync(agentsPath, "utf-8") + "\n\n";
    }

    const graphifyDir = findUp("graphify-out", process.cwd());
    if (graphifyDir) {
      const graphPath = path.join(graphifyDir, "GRAPH_REPORT.md");
      if (fs.existsSync(graphPath)) {
        const graphContent = fs.readFileSync(graphPath, "utf-8");
        context += "--- ARQUITETURA DO PROJETO (GRAPH_REPORT.md) ---\n";
        context += graphContent.length > 100000 ? graphContent.substring(0, 100000) + "\n...[TRUNCATED]" : graphContent;
      }
    }
  } catch (e) {}
  
  return context || "Nenhum contexto automático encontrado.";
}

function getHistoryFilePath() {
  const { getCliDataDir } = require("../constants");
  const appDir = getCliDataDir();
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  const sanitizedPath = process.cwd().replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return path.join(appDir, `chat_history_${sanitizedPath}.json`);
}

module.exports = {
  confirmWithAuto,
  findUp,
  getProjectContext,
  getHistoryFilePath
};
