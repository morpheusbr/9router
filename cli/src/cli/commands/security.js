const fs = require("fs");
const path = require("path");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🛡️ HiperRouter Security & SAST Vulnerability Scanner`);
  console.log(`====================================================\n`);

  console.log(`⏳ Escaneando arquivos do projeto em busca de falhas de segurança (XSS, SSRF, Hardcoded Secrets)...`);

  const cwd = process.cwd();
  const vulnerabilities = [];

  function scanDir(dir, depth = 0) {
    if (depth > 5) return;
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.startsWith(".") || f === "node_modules" || f === "dist" || f === ".git") continue;
        const fp = path.join(dir, f);
        const stat = fs.statSync(fp);
        if (stat.isDirectory()) {
          scanDir(fp, depth + 1);
        } else if (f.endsWith(".js") || f.endsWith(".ts") || f.endsWith(".jsx") || f.endsWith(".json")) {
          const content = fs.readFileSync(fp, "utf8");
          
          // Pattern checks
          if (content.match(/(?:api[_-]?key|secret|password)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i)) {
            vulnerabilities.push({ file: path.relative(cwd, fp), issue: "Chave ou segredo hardcoded detectado", severity: "HIGH" });
          }
          if (content.includes("dangerouslySetInnerHTML") || content.includes("eval(")) {
            vulnerabilities.push({ file: path.relative(cwd, fp), issue: "Uso inseguro de eval() ou dangerouslySetInnerHTML (Risco XSS)", severity: "MEDIUM" });
          }
          if (content.match(/fetch\s*\(\s*req\.(?:query|body|params)/i)) {
            vulnerabilities.push({ file: path.relative(cwd, fp), issue: "Requisição HTTP com parâmetro de entrada sem validação (Risco SSRF)", severity: "HIGH" });
          }
        }
      }
    } catch(e) {}
  }

  scanDir(cwd);

  console.log(`\n📊 RELATÓRIO DE AUDITORIA DE SEGURANÇA:`);
  console.log(`====================================================`);

  if (vulnerabilities.length === 0) {
    console.log(`🎉 Nenhum padrão vulnerável crítico detectado na varredura inicial!`);
    console.log(`✅ Projeto limpo de segredos expostos e padronizado.`);
  } else {
    console.log(`⚠️  Detectadas ${vulnerabilities.length} potenciais vulnerabilidade(s):\n`);
    vulnerabilities.forEach((v, i) => {
      const color = v.severity === "HIGH" ? "\x1b[31m" : "\x1b[33m";
      console.log(`  [${i + 1}] ${color}[${v.severity}]\x1b[0m ${v.file}: ${v.issue}`);
    });
  }

  console.log(`====================================================\n`);
  await pause();
  return 0;
}

module.exports = { run };
