const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { COLORS } = require("../utils/input");

async function run(args) {
  console.log(`\n📦 ${COLORS.bright}${COLORS.cyan}DEPENDENCY AUDITOR${COLORS.reset}`);
  console.log(`${"─".repeat(50)}\n`);

  const pkgPath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.log(`${COLORS.red}❌ Nenhum package.json encontrado.${COLORS.reset}\n`);
    return 1;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});

  console.log(` 📦 Projeto: ${pkg.name || "N/A"} v${pkg.version || "N/A"}`);
  console.log(` 🔹 Prod: ${deps.length} │ 🔸 Dev: ${devDeps.length}\n`);

  // 1. npm outdated
  console.log(`${COLORS.bright}📦 PACOTES DESATUALIZADOS:${COLORS.reset}`);
  try {
    const outdated = execSync("npm outdated --json 2>/dev/null", {
      encoding: "utf8",
      timeout: 30000,
      cwd: process.cwd(),
    });
    const parsed = JSON.parse(outdated || "{}");
    const entries = Object.entries(parsed);
    if (entries.length === 0) {
      console.log(`  ${COLORS.green}✅ Todas as dependências estão atualizadas!${COLORS.reset}\n`);
    } else {
      console.log(`  ${COLORS.yellow}⚠️  ${entries.length} pacote(s) desatualizado(s):${COLORS.reset}\n`);
      for (const [name, info] of entries) {
        const current = info.current || '?';
        const latest = info.latest || info.wanted || '?';
        const type = info.type === 'devDependencies' ? '🔸' : '🔹';
        console.log(`  ${type} ${COLORS.cyan}${name}${COLORS.reset}: ${current} → ${COLORS.green}${latest}${COLORS.reset}`);
      }
      console.log(`\n  ${COLORS.dim}Execute 'rtk npm update' para atualizar.${COLORS.reset}\n`);
    }
  } catch (e) {
    // npm outdated exits 1 when there are outdated packages
    try {
      const parsed = JSON.parse(e.stdout || "{}");
      const entries = Object.entries(parsed);
      if (entries.length > 0) {
        console.log(`  ${COLORS.yellow}⚠️  ${entries.length} pacote(s) desatualizado(s):${COLORS.reset}\n`);
        for (const [name, info] of entries.slice(0, 20)) {
          const current = info.current || '?';
          const latest = info.latest || info.wanted || '?';
          const type = info.type === 'devDependencies' ? '🔸' : '🔹';
          console.log(`  ${type} ${COLORS.cyan}${name}${COLORS.reset}: ${current} → ${COLORS.green}${latest}${COLORS.reset}`);
        }
        if (entries.length > 20) console.log(`  ${COLORS.dim}... e mais ${entries.length - 20} pacote(s)${COLORS.reset}`);
        console.log();
      }
    } catch { console.log(`  ${COLORS.dim}Não foi possível verificar.${COLORS.reset}\n`); }
  }

  // 2. npm audit
  console.log(`${COLORS.bright}🔒 AUDITORIA DE SEGURANÇA (npm audit):${COLORS.reset}`);
  try {
    const audit = execSync("npm audit --json 2>/dev/null", {
      encoding: "utf8",
      timeout: 30000,
      cwd: process.cwd(),
    });
    const parsed = JSON.parse(audit || "{}");
    const vulns = parsed.metadata?.vulnerabilities || {};
    const total = Object.values(vulns).reduce((a, b) => a + b, 0);
    if (total === 0) {
      console.log(`  ${COLORS.green}✅ Nenhuma vulnerabilidade encontrada!${COLORS.reset}\n`);
    } else {
      console.log(`  ${COLORS.red}⚠️  ${total} vulnerabilidade(s) encontrada(s):${COLORS.reset}`);
      if (vulns.critical) console.log(`    🔴 Críticas: ${vulns.critical}`);
      if (vulns.high) console.log(`    🟠 Altas: ${vulns.high}`);
      if (vulns.moderate) console.log(`    🟡 Moderadas: ${vulns.moderate}`);
      if (vulns.low) console.log(`    🟢 Baixas: ${vulns.low}`);
      console.log(`\n  ${COLORS.dim}Execute 'rtk npm audit fix' para corrigir automaticamente.${COLORS.reset}\n`);
    }
  } catch (e) {
    try {
      const parsed = JSON.parse(e.stdout || "{}");
      const vulns = parsed.metadata?.vulnerabilities || {};
      const total = Object.values(vulns).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log(`  ${COLORS.red}⚠️  ${total} vulnerabilidade(s) encontrada(s):${COLORS.reset}`);
        if (vulns.critical) console.log(`    🔴 Críticas: ${vulns.critical}`);
        if (vulns.high) console.log(`    🟠 Altas: ${vulns.high}`);
        if (vulns.moderate) console.log(`    🟡 Moderadas: ${vulns.moderate}`);
        if (vulns.low) console.log(`    🟢 Baixas: ${vulns.low}`);
        console.log();
      } else {
        console.log(`  ${COLORS.green}✅ Nenhuma vulnerabilidade encontrada!${COLORS.reset}\n`);
      }
    } catch { console.log(`  ${COLORS.dim}Não foi possível auditar.${COLORS.reset}\n`); }
  }

  // 3. Missing node_modules
  console.log(`${COLORS.bright}📂 STATUS DE INSTALAÇÃO:${COLORS.reset}`);
  const nmPath = path.join(process.cwd(), "node_modules");
  if (!fs.existsSync(nmPath)) {
    console.log(`  ${COLORS.red}❌ node_modules não encontrado. Execute 'npm install'.${COLORS.reset}\n`);
  } else {
    const allDeps = [...deps, ...devDeps];
    const missing = allDeps.filter(d => !fs.existsSync(path.join(nmPath, d)));
    if (missing.length === 0) {
      console.log(`  ${COLORS.green}✅ Todas as dependências estão instaladas.${COLORS.reset}\n`);
    } else {
      console.log(`  ${COLORS.yellow}⚠️  ${missing.length} pacote(s) faltando:${COLORS.reset}`);
      missing.forEach(d => console.log(`    • ${d}`));
      console.log(`\n  ${COLORS.dim}Execute 'npm install' para instalar.${COLORS.reset}\n`);
    }
  }

  return 0;
}

module.exports = { run };
