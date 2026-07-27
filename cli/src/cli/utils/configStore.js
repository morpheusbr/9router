/**
 * Persistent user preferences (smart defaults, favorites, locale).
 * Stored in ~/.HiperRouter/cli-config.json
 */
const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(
  process.env.DATA_DIR || path.resolve(__dirname, "../../../..", ".HiperRouter"),
  "cli-config.json"
);

let _cache = null;

function load() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch {}
  _cache = _cache || {};
  return _cache;
}

function save(config) {
  _cache = config;
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  } catch {}
}

function get(key, fallback) {
  const cfg = load();
  return cfg[key] !== undefined ? cfg[key] : fallback;
}

function set(key, value) {
  const cfg = load();
  cfg[key] = value;
  save(cfg);
}

function appendToArray(key, value, maxItems = 10) {
  const cfg = load();
  const arr = Array.isArray(cfg[key]) ? cfg[key] : [];
  // Remove duplicates, add to front, cap size
  const filtered = arr.filter(v => v !== value);
  filtered.unshift(value);
  cfg[key] = filtered.slice(0, maxItems);
  save(cfg);
}

function getArray(key) {
  const cfg = load();
  return Array.isArray(cfg[key]) ? cfg[key] : [];
}

module.exports = { load, save, get, set, appendToArray, getArray, CONFIG_FILE };
