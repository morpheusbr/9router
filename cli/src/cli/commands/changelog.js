const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n📜 HiperRouter Smart Git Commit & Release Automator`);
  console.log(`===================================================\n`);

  console.log(`⏳ Analisando commits recentes do git para gerar CHANGELOG.md...`);

  let gitLogs = "";
  try {
    gitLogs = execSync("rtk git log -n 20 --oneline", { encoding: "utf8" });
  } catch (e) {
    console.log(`❌ Repositório git não inicializado ou sem commits.`);
    await pause();
    return 1;
  }

  const changelogContent = `# CHANGELOG — Release Notes

Gerado automaticamente pelo HiperRouter CLI em ${new Date().toLocaleString("pt-BR")}.

## 🚀 Commits Recentes:

\`\`\`
${gitLogs}
\`\`\`
`;

  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  fs.writeFileSync(changelogPath, changelogContent, "utf8");

  console.log(`✅ CHANGELOG.md atualizado e salvo com sucesso em: ${changelogPath}\n`);
  await pause();
  return 0;
}

module.exports = { run };
