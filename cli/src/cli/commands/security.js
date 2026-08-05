const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { COLORS } = require("../utils/input");

const PATTERNS = [
  // Hardcoded secrets
  { regex: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi, issue: "Chave/segredo hardcoded", severity: "HIGH" },
  { regex: /(?:AKIA|ASIA)[A-Z0-9]{16}/g, issue: "AWS Access Key detectada", severity: "CRITICAL" },
  { regex: /sk-[a-zA-Z0-9]{48}/g, issue: "OpenAI API Key detectada", severity: "CRITICAL" },
  { regex: /ghp_[a-zA-Z0-9]{36}/g, issue: "GitHub Personal Access Token", severity: "CRITICAL" },
  // Code injection
  { regex: /\beval\s*\(/g, issue: "Uso de eval() — risco de code injection", severity: "HIGH" },
  { regex: /new\s+Function\s*\(/g, issue: "Uso de new Function() — risco de code injection", severity: "HIGH" },
  { regex: /dangerouslySetInnerHTML/g, issue: "dangerouslySetInnerHTML — risco de XSS", severity: "MEDIUM" },
  // SSRF patterns
  { regex: /fetch\s*\(\s*(?:req\.(?:query|body|params)|input|userInput)/gi, issue: "Fetch com input não validado — risco de SSRF", severity: "HIGH" },
  { regex: /new\s+URL\s*\(\s*(?:req\.(?:query|body|params))/gi, issue: "new URL() com input não validado — risco de SSRF", severity: "HIGH" },
  // Path traversal
  { regex: /(?:readFile|readFileSync|writeFile|writeFileSync)\s*\(\s*(?:req\.|input|userInput)/gi, issue: "File operation com input não validado — risco de path traversal", severity: "HIGH" },
  // Command injection
  { regex: /exec\s*\(\s*["'`]?\$\{/g, issue: "Template literal em exec() — risco de command injection", severity: "CRITICAL" },
  { regex: /execSync\s*\(\s*["'`]?\$\{/g, issue: "Template literal em execSync() — risco de command injection", severity: "CRITICAL" },
  // SQL injection
  { regex: /(?:query|execute)\s*\(\s*["'`].*\$\{/g, issue: "Template literal em SQL query — risco de SQL injection", severity: "HIGH" },
  // Prototype pollution
  { regex: /Object\.assign\s*\(\s*\{?\s*\.\.\.req\./g, issue: "Object.assign com req spread — risco de prototype pollution", severity: "MEDIUM" },
];

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', 'graphify-out']);
const SCAN_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.json', '.env']);

function scanFile(filePath, cwd) {
  const findings = [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(cwd, filePath);

    for (const { regex, issue, severity } of PATTERNS) {
      regex.lastIndex = 0;
      const matches = content.match(regex);
      if (matches) {
        findings.push({ file: relPath, issue, severity, count: matches.length });
      }
    }
  } catch {}
  return findings;
}

function scanDir(dir, cwd, depth = 0) {
  if (depth > 6) return [];
  const findings = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (SKIP_DIRS.has(f) || f.startsWith('.')) continue;
      const fp = path.join(dir, f);
      try {
        const stat = fs.statSync(fp);
        if (stat.isDirectory()) {
          findings.push(...scanDir(fp, cwd, depth + 1));
        } else if (SCAN_EXTS.has(path.extname(f))) {
          findings.push(...scanFile(fp, cwd));
        }
      } catch {}
    }
  } catch {}
  return findings;
}

async function run(args) {
  const cwd = process.cwd();

  console.log(`\n🛡️  ${COLORS.bright}${COLORS.cyan}SECURITY SCANNER (SAST + npm audit)${COLORS.reset}`);
  console.log(`${"─".repeat(50)}\n`);

  // 1. SAST scan
  console.log(`${COLORS.bright}🔍 VARREDURA ESTÁTICA DE CÓDIGO:${COLORS.reset}`);
  const findings = scanDir(cwd, cwd);

  if (findings.length === 0) {
    console.log(`  ${COLORS.green}✅ Nenhum padrão vulnerável detectado!${COLORS.reset}\n`);
  } else {
    // Deduplicate by file+issue
    const seen = new Set();
    const unique = findings.filter(f => {
      const key = `${f.file}:${f.issue}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const critical = unique.filter(f => f.severity === 'CRITICAL');
    const high = unique.filter(f => f.severity === 'HIGH');
    const medium = unique.filter(f => f.severity === 'MEDIUM');

    console.log(`  ${COLORS.red}⚠️  ${unique.length} vulnerabilidade(s) encontrada(s):${COLORS.reset}\n`);
    if (critical.length) {
      console.log(`  ${COLORS.red}${COLORS.bright}🔴 CRÍTICAS (${critical.length}):${COLORS.reset}`);
      critical.forEach(v => console.log(`    ${COLORS.red}• ${v.file}: ${v.issue}${COLORS.reset}`));
    }
    if (high.length) {
      console.log(`  ${COLORS.red}🟠 ALTAS (${high.length}):${COLORS.reset}`);
      high.forEach(v => console.log(`    ${COLORS.yellow}• ${v.file}: ${v.issue}${COLORS.reset}`));
    }
    if (medium.length) {
      console.log(`  ${COLORS.yellow}🟡 MÉDIAS (${medium.length}):${COLORS.reset}`);
      medium.forEach(v => console.log(`    ${COLORS.dim}• ${v.file}: ${v.issue}${COLORS.reset}`));
    }
    console.log();
  }

  // 2. npm audit
  console.log(`${COLORS.bright}🔒 AUDITORIA DE DEPENDÊNCIAS (npm audit):${COLORS.reset}`);
  try {
    const auditJson = execSync("npm audit --json 2>/dev/null", { encoding: "utf8", timeout: 30000, cwd });
    const audit = JSON.parse(auditJson || '{}');
    const vulns = audit.metadata?.vulnerabilities || {};
    const total = Object.values(vulns).reduce((a, b) => a + b, 0);
    if (total === 0) {
      console.log(`  ${COLORS.green}✅ Nenhuma vulnerabilidade nas dependências!${COLORS.reset}\n`);
    } else {
      console.log(`  ${COLORS.red}⚠️  ${total} vulnerabilidade(s):${COLORS.reset}`);
      if (vulns.critical) console.log(`    🔴 Críticas: ${vulns.critical}`);
      if (vulns.high) console.log(`    🟠 Altas: ${vulns.high}`);
      if (vulns.moderate) console.log(`    🟡 Moderadas: ${vulns.moderate}`);
      if (vulns.low) console.log(`    🟢 Baixas: ${vulns.low}`);
      console.log(`\n  ${COLORS.dim}rtk npm audit fix${COLORS.reset}\n`);
    }
  } catch (e) {
    try {
      const audit = JSON.parse(e.stdout || '{}');
      const vulns = audit.metadata?.vulnerabilities || {};
      const total = Object.values(vulns).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log(`  ${COLORS.red}⚠️  ${total} vulnerabilidade(s) nas dependências${COLORS.reset}\n`);
      } else {
        console.log(`  ${COLORS.green}✅ Nenhuma vulnerabilidade nas dependências!${COLORS.reset}\n`);
      }
    } catch { console.log(`  ${COLORS.dim}Não foi possível auditar dependências.${COLORS.reset}\n`); }
  }

  // 3. .env exposure check
  console.log(`${COLORS.bright}📋 VERIFICAÇÃO DE .gitignore:${COLORS.reset}`);
  const gitignorePath = path.join(cwd, '.gitignore');
  const sensitiveFiles = ['.env', '.env.local', '.env.production', 'db.sqlite', 'data.sqlite'];
  const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';

  const unignored = sensitiveFiles.filter(f => {
    const exists = fs.existsSync(path.join(cwd, f)) || fs.existsSync(path.join(cwd, '.HiperRouter', 'db', f));
    if (!exists) return false;
    return !gitignore.includes(f) && !gitignore.includes('.env*');
  });

  if (unignored.length === 0) {
    console.log(`  ${COLORS.green}✅ Arquivos sensíveis protegidos pelo .gitignore${COLORS.reset}\n`);
  } else {
    console.log(`  ${COLORS.red}⚠️  Arquivos sensíveis NÃO no .gitignore:${COLORS.reset}`);
    unignored.forEach(f => console.log(`    • ${f}`));
    console.log();
  }

  console.log(`${"─".repeat(50)}\n`);
  return 0;
}

module.exports = { run };
