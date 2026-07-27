const readline = require("readline");

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underline: "\x1b[4m",
  reverse: "\x1b[7m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m",
  black: "\x1b[30m",
  terracotta: "\x1b[38;2;217;119;87m",
  bgTerracotta: "\x1b[48;2;217;119;87m"
};

// Prime stdin once globally. Toggling raw mode between menus adds latency on
// macOS, so we keep raw mode on for the whole TUI session.
let rawPrimed = false;
function primeRawOnce() {
  if (rawPrimed || !process.stdin.isTTY) return;
  try {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    rawPrimed = true;
  } catch {}
}

function suspendRawFor(fn) {
  // Temporarily drop raw mode so readline.question can buffer line input.
  const wasPrimed = rawPrimed;
  if (wasPrimed && process.stdin.isTTY) {
    try { process.stdin.setRawMode(false); } catch {}
  }
  return fn().finally(() => {
    if (wasPrimed && process.stdin.isTTY) {
      try { process.stdin.setRawMode(true); } catch {}
      process.stdin.resume();
    }
  });
}

const SLASH_COMMANDS = [
  "/plan", "/code", "/test", "/commit", "/review", "/skill", "/debug",
  "/read", "/model", "/fav", "/palette", "/web", "/menu", "/history",
  "/status", "/undo", "/save", "/copy", "/copy-code", "/paste",
  "/paste-image", "/image", "/rollback", "/audit", "/stats", "/help",
  "/clear", "/exit"
];

const COMMAND_DESCRIPTIONS = {
  "/plan": "Planning mode — generate architecture/plan",
  "/code": "Coding mode — simulate subagents before coding",
  "/test": "Test generator — create unit tests for a file",
  "/commit": "Auto-commit — semantic commit from git diff",
  "/review": "Code review — audit git diff for bugs",
  "/skill": "Skill generator — create a custom skill",
  "/debug": "Debug mode — capture PM2 error logs",
  "/read": "Read file — inject file content into chat",
  "/model": "Switch model — interactive model picker with search",
  "/fav": "Favorite model — add/remove current model from favorites",
  "/palette": "Command palette — fuzzy search for commands (Ctrl+K)",
  "/web": "Open dashboard in browser",
  "/menu": "Management TUI — providers, keys, settings",
  "/history": "Show recent messages",
  "/status": "Check server health",
  "/undo": "Restore last backup (.bak file)",
  "/save": "Export chat to Markdown file",
  "/copy": "Copy last AI response to clipboard",
  "/copy-code": "Copy last code block to clipboard",
  "/paste": "Multiline paste mode",
  "/image": "Attach image from clipboard or file",
  "/rollback": "Revert git to pre-patch snapshot",
  "/audit": "Show audit log entries",
  "/stats": "Session telemetry — tokens, requests, time",
  "/help": "Show this help",
  "/clear": "Reset chat history",
  "/exit": "Quit HiperRouter Agent"
};

// Fuzzy match: checks if query chars appear in order within target
function fuzzyMatch(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function defaultCompleter(line) {
  if (line.startsWith("/")) {
    const hits = SLASH_COMMANDS.filter((c) => c.startsWith(line));
    return [hits.length ? hits : SLASH_COMMANDS, line];
  }
  return [[], line];
}

async function prompt(question, options = {}) {
  const completer = typeof options === "function" ? options : (options.completer || defaultCompleter);
  primeRawOnce();
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: completer,
      terminal: true
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || "").trim());
    });
  });
}

async function select(question, options) {
  console.log(question);
  options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
  if (!process.stdin.isTTY) {
    console.log(`${COLORS.dim}[Non-TTY: auto-selecting first option]${COLORS.reset}`);
    return 0;
  }
  while (true) {
    const answer = await prompt("\nSelect option (number): ");
    const num = parseInt(answer, 10);
    if (!isNaN(num) && num >= 1 && num <= options.length) return num - 1;
    console.log(`Invalid selection. Please enter a number between 1 and ${options.length}`);
  }
}

async function confirm(question) {
  if (!process.stdin.isTTY) {
    console.log(`${COLORS.dim}[Non-TTY: auto-confirming]${COLORS.reset}`);
    return true;
  }
  while (true) {
    const answer = await prompt(`${question} (y/n): `);
    const lower = answer.toLowerCase();
    if (lower === "y" || lower === "yes") return true;
    if (lower === "n" || lower === "no") return false;
    console.log("Please answer 'y' or 'n'");
  }
}

async function pause(message = "Press Enter to continue...") {
  return suspendRawFor(() => new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => { rl.close(); resolve(); });
  }));
}

/**
 * Interactive arrow-key menu. Renders ★/☆ icons; selected line uses reverse+bright
 * (no underline). Uses readline keypress + raw 'data' fallback to prevent
 * arrow-key escape sequence leaks on macOS.
 */
async function selectMenu(title, items, defaultIndex = 0, subtitle = "", headerContent = "", breadcrumb = []) {
  return new Promise((resolve) => {
    let selectedIndex = defaultIndex;
    let isActive = true;
    let filterQuery = "";

    primeRawOnce();
    if (!process.stdin.isTTY) { resolve(-1); return; }

    // Fuzzy match for type-ahead filtering
    const fuzzyMatchLocal = (query, target) => {
      const q = query.toLowerCase();
      const t = target.toLowerCase();
      let qi = 0;
      for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) qi++;
      }
      return qi === q.length;
    };

    const getFilteredIndices = () => {
      if (!filterQuery) return items.map((_, i) => i);
      return items
        .map((item, i) => ({ item, i }))
        .filter(({ item }) => fuzzyMatchLocal(filterQuery, item.label))
        .map(({ i }) => i);
    };

    const renderMenu = () => {
      if (!isActive) return;
      process.stdout.write("\x1b[2J\x1b[H");
      const width = Math.min(process.stdout.columns || 60, 60);
      console.log(`\n${COLORS.terracotta}${"=".repeat(width)}${COLORS.reset}`);
      console.log(`  ${COLORS.bright}${COLORS.terracotta}${title}${COLORS.reset}`);
      if (subtitle) console.log(`  ${COLORS.dim}${subtitle}${COLORS.reset}`);
      console.log(`${COLORS.terracotta}${"=".repeat(width)}${COLORS.reset}`);
      if (breadcrumb.length > 0) console.log(`  ${COLORS.dim}${breadcrumb.join(" > ")}${COLORS.reset}`);
      console.log();
      if (headerContent) { console.log(headerContent); console.log(); }

      const filteredIndices = getFilteredIndices();
      const isWin = process.platform === "win32";

      // Show filter input if active
      if (filterQuery) {
        console.log(`  ${COLORS.cyan}Filter: ${filterQuery}${COLORS.reset}${COLORS.dim}█${COLORS.reset}`);
        console.log();
      }

      // Render only filtered items
      filteredIndices.forEach((itemIndex, displayIndex) => {
        const item = items[itemIndex];
        const isSelected = displayIndex === selectedIndex;
        const icon = isSelected ? (isWin ? ">" : "★") : (isWin ? " " : "☆");
        if (isSelected) {
          console.log(` ${COLORS.reverse}${COLORS.bright}${icon} ${item.label}${COLORS.reset}`);
        } else {
          console.log(`  ${icon} ${item.label}`);
        }
      });

      if (filteredIndices.length === 0) {
        console.log(`  ${COLORS.dim}(no matches for "${filterQuery}")${COLORS.reset}`);
      }
    };

    const cleanup = () => {
      if (!isActive) return;
      isActive = false;
      process.stdin.removeListener("keypress", onKeypress);
    };

    const move = (delta) => {
      const filteredIndices = getFilteredIndices();
      if (filteredIndices.length === 0) return;
      selectedIndex = (selectedIndex + delta + filteredIndices.length) % filteredIndices.length;
      renderMenu();
    };

    const onKeypress = (_str, key) => {
      if (!isActive || !key) return;
      if (key.name === "up") return move(-1);
      if (key.name === "down") return move(1);
      if (key.name === "return") {
        cleanup();
        const filteredIndices = getFilteredIndices();
        const originalIndex = filteredIndices[selectedIndex] ?? -1;
        resolve(originalIndex);
        return;
      }
      if (key.name === "escape") {
        if (filterQuery) {
          filterQuery = "";
          selectedIndex = 0;
          renderMenu();
          return;
        }
        cleanup();
        resolve(-1);
        return;
      }
      if (key.ctrl && key.name === "c") { cleanup(); resolve(-1); return; }
      // Backspace — remove from filter
      if (key.name === "backspace") {
        filterQuery = filterQuery.slice(0, -1);
        selectedIndex = 0;
        renderMenu();
        return;
      }
      // Type to filter
      if (_str && !key.ctrl && !key.meta && _str.length === 1 && _str >= " ") {
        filterQuery += _str;
        selectedIndex = 0;
        renderMenu();
        return;
      }
    };

    process.stdin.on("keypress", onKeypress);
    renderMenu();
  });
}

/**
 * Command palette with fuzzy search. Opens as a floating overlay.
 * @param {string} title - Palette title
 * @returns {Promise<string|null>} Selected command or null if cancelled
 */
async function commandPalette(title = "Command Palette") {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) { resolve(null); return; }

    primeRawOnce();
    let query = "";
    let selectedIndex = 0;
    let isActive = true;

    const getFiltered = () => {
      if (!query) return SLASH_COMMANDS;
      return SLASH_COMMANDS.filter(cmd => fuzzyMatch(query, cmd));
    };

    const render = () => {
      if (!isActive) return;
      const filtered = getFiltered();
      if (selectedIndex >= filtered.length) selectedIndex = Math.max(0, filtered.length - 1);

      // Move cursor up to overwrite previous render
      const linesToClear = Math.min(filtered.length, 10) + 4;
      process.stdout.write(`\x1b[${linesToClear}A\x1b[0J`);

      console.log(`${COLORS.cyan}╭─ ${title} ${COLORS.dim}(type to filter, ↑↓ navigate, Enter select, Esc cancel)${COLORS.reset}`);
      console.log(`${COLORS.cyan}│${COLORS.reset} ${COLORS.bright}> ${query}${COLORS.reset}${COLORS.dim}█${COLORS.reset}`);

      const visible = filtered.slice(0, 8);
      visible.forEach((cmd, i) => {
        const isSelected = i === selectedIndex;
        const desc = COMMAND_DESCRIPTIONS[cmd] || "";
        if (isSelected) {
          console.log(`${COLORS.cyan}│${COLORS.reset} ${COLORS.reverse}${COLORS.bright} ${cmd.padEnd(18)} ${COLORS.dim}${desc}${COLORS.reset}`);
        } else {
          console.log(`${COLORS.cyan}│${COLORS.reset}  ${cmd.padEnd(18)} ${COLORS.dim}${desc}${COLORS.reset}`);
        }
      });

      if (filtered.length > 8) {
        console.log(`${COLORS.cyan}│${COLORS.reset} ${COLORS.dim}  ... and ${filtered.length - 8} more${COLORS.reset}`);
      } else {
        console.log(`${COLORS.cyan}│${COLORS.reset}`);
      }
      console.log(`${COLORS.cyan}╰${COLORS.reset}`);
    };

    const cleanup = () => {
      if (!isActive) return;
      isActive = false;
      process.stdin.removeListener("keypress", onKeypress);
    };

    const onKeypress = (str, key) => {
      if (!isActive || !key) return;

      if (key.name === "escape") { cleanup(); resolve(null); return; }
      if (key.ctrl && key.name === "c") { cleanup(); resolve(null); return; }

      const filtered = getFiltered();

      if (key.name === "up") {
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
        return;
      }
      if (key.name === "down") {
        selectedIndex = Math.min(filtered.length - 1, selectedIndex + 1);
        render();
        return;
      }
      if (key.name === "return") {
        cleanup();
        resolve(filtered[selectedIndex] || null);
        return;
      }
      if (key.name === "backspace") {
        query = query.slice(0, -1);
        selectedIndex = 0;
        render();
        return;
      }
      if (str && !key.ctrl && !key.meta && str.length === 1) {
        query += str;
        selectedIndex = 0;
        render();
        return;
      }
    };

    // Initial render
    const initialLines = Math.min(SLASH_COMMANDS.length, 10) + 4;
    for (let i = 0; i < initialLines; i++) console.log();
    render();

    process.stdin.on("keypress", onKeypress);
  });
}

module.exports = {
  prompt,
  select,
  confirm,
  pause,
  selectMenu,
  commandPalette,
  fuzzyMatch,
  SLASH_COMMANDS,
  COMMAND_DESCRIPTIONS,
  COLORS
};
