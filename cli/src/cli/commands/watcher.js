const fs = require("fs");
const path = require("path");
const { COLORS } = require("../utils/input");

let watcher = null;
let debounceTimer = null;
const changeLog = [];
const MAX_LOG = 100;

const WATCH_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.json', '.css', '.md']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'graphify-out', '.HiperRouter']);

function formatEvent(eventType, filePath) {
  const now = new Date();
  const time = now.toTimeString().split(' ')[0];
  const relPath = path.relative(process.cwd(), filePath);
  const ext = path.extname(filePath);
  const icon = eventType === 'rename' ? '🆕' : '✏️';
  return { time, icon, eventType, relPath, ext };
}

async function run(args) {
  if (watcher) {
    watcher.close();
    watcher = null;
    if (debounceTimer) clearTimeout(debounceTimer);
    console.log(`\n${COLORS.red}🔴 File Watcher DESATIVADO.${COLORS.reset}`);
    console.log(`${COLORS.dim}${changeLog.length} alterações registradas nesta sessão.${COLORS.reset}\n`);
    return 0;
  }

  const watchDir = process.cwd();
  const mode = args[0] || 'all';

  console.log(`\n${COLORS.bright}${COLORS.cyan}⚡ FILE WATCHER${COLORS.reset}`);
  console.log(`${"─".repeat(50)}\n`);
  console.log(`${COLORS.green}🟢 Monitoramento ATIVADO${COLORS.reset} em: ${COLORS.dim}${watchDir}${COLORS.reset}`);
  console.log(`${COLORS.dim}Modo: ${mode} | Exts: ${[...WATCH_EXTS].join(', ')}${COLORS.reset}`);
  console.log(`${COLORS.dim}Pressione /watch novamente para parar.${COLORS.reset}\n`);

  try {
    watcher = fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // Skip ignored dirs
      const parts = filename.split(path.sep);
      if (parts.some(p => SKIP_DIRS.has(p) || p.startsWith('.'))) return;

      const ext = path.extname(filename);
      if (!WATCH_EXTS.has(ext)) return;

      // Debounce (200ms)
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const fullPath = path.join(watchDir, filename);
        const entry = formatEvent(eventType, fullPath);
        changeLog.push(entry);
        if (changeLog.length > MAX_LOG) changeLog.shift();

        // Check if file still exists (rename = delete or create)
        const exists = fs.existsSync(fullPath);
        const size = exists ? fs.statSync(fullPath).size : 0;

        console.log(`${COLORS.dim}[${entry.time}]${COLORS.reset} ${entry.icon} ${COLORS.cyan}${entry.relPath}${COLORS.reset} (${entry.eventType}, ${(size/1024).toFixed(1)}KB)`);

        // Auto-graphify on .js/.ts changes (debounced)
        if (['.js', '.ts', '.jsx', '.tsx'].includes(ext) && eventType === 'change') {
          try {
            const { spawn } = require("child_process");
            spawn("rtk", ["graphify", "update", "."], { cwd: watchDir, detached: true, stdio: "ignore" }).unref();
          } catch {}
        }
      }, 200);
    });

    watcher.on('error', (err) => {
      console.log(`${COLORS.red}❌ Erro no watcher: ${err.message}${COLORS.reset}`);
      watcher.close();
      watcher = null;
    });

  } catch (err) {
    console.log(`${COLORS.red}❌ Não foi possível iniciar watcher: ${err.message}${COLORS.reset}\n`);
    return 1;
  }

  return 0;
}

module.exports = { run };
