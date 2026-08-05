const { execSync } = require("child_process");
const { COLORS, confirm } = require("../utils/input");
const fs = require("fs");
const path = require("path");

async function run(args) {
  console.log(`\n🧪 ${COLORS.bright}${COLORS.cyan}TEST RUNNER + AUTO-FIX${COLORS.reset}`);
  console.log(`${"─".repeat(50)}\n`);

  const testCmd = args.length > 0 ? args.join(" ") : "npm test";
  console.log(`${COLORS.dim}Executando: ${testCmd}${COLORS.reset}\n`);

  let output = "";
  let exitCode = 0;

  try {
    output = execSync(testCmd, {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 120000,
      cwd: process.cwd(),
    });
    console.log(output);
    console.log(`\n${COLORS.green}✅ Todos os testes passaram!${COLORS.reset}\n`);
    return 0;
  } catch (err) {
    exitCode = err.status || 1;
    output = (err.stdout || "") + "\n" + (err.stderr || "");
  }

  // Tests failed
  console.log(`${COLORS.red}❌ Testes falharam (exit code ${exitCode})${COLORS.reset}\n`);

  // Parse error output - find failing test files and error messages
  const lines = output.split("\n");
  const errorLines = lines.filter(l =>
    l.includes("FAIL") ||
    l.includes("Error:") ||
    l.includes("AssertionError") ||
    l.includes("Expected") ||
    l.includes("Received") ||
    l.includes("● ") ||
    l.match(/^\s*at\s+/) ||
    l.includes("TypeError") ||
    l.includes("ReferenceError")
  );

  if (errorLines.length > 0) {
    console.log(`${COLORS.bright}📋 Erros detectados:${COLORS.reset}`);
    errorLines.slice(0, 20).forEach(l => console.log(`  ${COLORS.red}${l}${COLORS.reset}`));
    if (errorLines.length > 20) console.log(`  ${COLORS.dim}... +${errorLines.length - 20} linhas${COLORS.reset}`);
  }

  // Find failing test files
  const fileMatches = output.match(/(?:FAIL|●)\s+([^\s]+\.(?:test|spec)\.[jt]sx?)/g);
  const failingFiles = fileMatches
    ? [...new Set(fileMatches.map(m => m.replace(/(?:FAIL|●)\s+/, '')))]
    : [];

  if (failingFiles.length > 0) {
    console.log(`\n${COLORS.bright}📂 Arquivos com falha:${COLORS.reset}`);
    failingFiles.forEach(f => console.log(`  • ${f}`));
  }

  // Offer auto-fix
  console.log(`\n${COLORS.bright}🔧 AUTO-FIX:${COLORS.reset}`);
  console.log(`${COLORS.dim}O erro acima pode ser corrigido pela IA.${COLORS.reset}`);
  console.log(`${COLORS.dim}Use o chat interativo e cole:${COLORS.reset}\n`);
  console.log(`  ${COLORS.cyan}/debug${COLORS.reset}  → Analisa logs PM2 automaticamente`);
  console.log(`  ${COLORS.cyan}/code Corrija o erro de teste: <cole o erro aqui>${COLORS.reset}`);

  // Save error to temp file for easy access
  const errorFile = path.join(process.cwd(), "scripts", "last-test-error.txt");
  try {
    const scriptsDir = path.dirname(errorFile);
    if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(errorFile, output.substring(0, 20000), "utf8");
    console.log(`\n${COLORS.dim}💾 Erro salvo em: scripts/last-test-error.txt${COLORS.reset}`);
    console.log(`${COLORS.dim}   Use: /read scripts/last-test-error.txt${COLORS.reset}\n`);
  } catch {}

  return exitCode;
}

module.exports = { run };
