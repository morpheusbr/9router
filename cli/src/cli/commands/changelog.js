const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { COLORS } = require("../utils/input");

const CONVENTIONAL_PREFIXES = {
  feat: { emoji: '✨', label: 'Features' },
  fix: { emoji: '🐛', label: 'Bug Fixes' },
  perf: { emoji: '⚡', label: 'Performance' },
  refactor: { emoji: '♻️', label: 'Refactors' },
  docs: { emoji: '📝', label: 'Documentation' },
  test: { emoji: '✅', label: 'Tests' },
  chore: { emoji: '🔧', label: 'Chores' },
  ci: { emoji: '👷', label: 'CI/CD' },
  build: { emoji: '📦', label: 'Build' },
  style: { emoji: '🎨', label: 'Style' },
  revert: { emoji: '⏪', label: 'Reverts' },
};

function parseConventionalCommit(message) {
  // Match: type(scope): description OR type: description
  const match = message.match(/^(\w+)(?:\(([^)]+)\))?\s*:\s*(.+)/);
  if (!match) return { type: 'other', scope: null, description: message };
  return { type: match[1].toLowerCase(), scope: match[2] || null, description: match[3].trim() };
}

async function run(args) {
  const n = parseInt(args[0]) || 50;

  console.log(`\n📜 ${COLORS.bright}${COLORS.cyan}CHANGELOG GENERATOR${COLORS.reset}`);
  console.log(`${"─".repeat(50)}\n`);

  let gitLogs = "";
  try {
    gitLogs = execSync(`rtk git log -n ${n} --format=%H|%s|%an|%ai`, { encoding: "utf8" });
  } catch (e) {
    console.log(`${COLORS.red}❌ Repositório git não inicializado ou sem commits.${COLORS.reset}\n`);
    return 1;
  }

  const commits = gitLogs.trim().split('\n').filter(Boolean).map(line => {
    const [hash, message, author, date] = line.split('|');
    const parsed = parseConventionalCommit(message);
    return { hash: hash.substring(0, 7), message, author, date: date?.split(' ')[0], ...parsed };
  });

  // Group by type
  const groups = {};
  const other = [];
  for (const c of commits) {
    if (CONVENTIONAL_PREFIXES[c.type]) {
      if (!groups[c.type]) groups[c.type] = [];
      groups[c.type].push(c);
    } else {
      other.push(c);
    }
  }

  // Generate markdown
  const lines = [`# CHANGELOG\n`, `Gerado automaticamente em ${new Date().toLocaleString("pt-BR")}.\n`];

  // Version section
  const latestTag = (() => { try { return execSync("rtk git describe --tags --abbrev=0 2>/dev/null", { encoding: "utf8" }).trim(); } catch { return null; } })();
  if (latestTag) lines.push(`## ${latestTag}\n`);

  // Ordered by importance
  const typeOrder = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'chore', 'ci', 'build', 'style', 'revert'];

  for (const type of typeOrder) {
    if (!groups[type]) continue;
    const { emoji, label } = CONVENTIONAL_PREFIXES[type];
    lines.push(`### ${emoji} ${label}\n`);
    for (const c of groups[type]) {
      const scope = c.scope ? `**${c.scope}:** ` : '';
      lines.push(`- ${scope}${c.description} (${c.hash})`);
    }
    lines.push('');
  }

  if (other.length > 0) {
    lines.push(`### 🔹 Outros\n`);
    for (const c of other) {
      lines.push(`- ${c.message} (${c.hash})`);
    }
    lines.push('');
  }

  // Stats
  lines.push(`---\n`);
  lines.push(`📊 ${commits.length} commits analisados | ${Object.keys(groups).length} tipos convencionais detectados\n`);

  const changelogContent = lines.join('\n');
  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  fs.writeFileSync(changelogPath, changelogContent, "utf8");

  // Also print to console
  console.log(changelogContent);
  console.log(`${COLORS.green}✅ CHANGELOG.md salvo em: ${changelogPath}${COLORS.reset}\n`);
  return 0;
}

module.exports = { run };
