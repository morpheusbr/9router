const path = require("path");
const fs = require("fs");
const os = require("os");

const APP_NAME = "HiperRouter";
const DEFAULT_PORT = 20128;
const DEFAULT_HOST = "0.0.0.0";
const MAX_PORT_ATTEMPTS = 10;

const PORT_MIN = 1024;
const PORT_MAX = 65535;

const PROCESS_IDENTIFIERS = [
  "9router",
  "hiperrouter"
];

function getCliDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, APP_NAME);
  }

  // Se estiver rodando do source (ex: /home/www/HiperRouter/cli)
  // __dirname = cli/src/cli
  const rootDir = path.resolve(__dirname, "../../..");
  const rootData = path.join(rootDir, ".HiperRouter");
  if (fs.existsSync(rootData)) return rootData;

  // Se estiver rodando do standalone ou via npm global
  const cwdDir = path.join(process.cwd(), '.HiperRouter');
  if (fs.existsSync(cwdDir)) return cwdDir;

  return path.join(os.homedir(), `.${APP_NAME}`);
}

module.exports = {
  APP_NAME,
  DEFAULT_PORT,
  DEFAULT_HOST,
  MAX_PORT_ATTEMPTS,
  PORT_MIN,
  PORT_MAX,
  PROCESS_IDENTIFIERS,
  getCliDataDir
};
