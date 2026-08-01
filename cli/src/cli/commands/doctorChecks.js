/**
 * Pure, side-effect-free check functions used by `doctor.js`.
 * Extracted here so they can be unit-tested without touching the filesystem,
 * network, or process state.
 */

/**
 * @param {string} nodeVersion - e.g. process.version ("v18.0.0")
 * @param {number} [minMajor=18]
 * @returns {{ ok: boolean, version: string, message: string }}
 */
function checkNodeVersion(nodeVersion, minMajor = 18) {
  const major = parseInt(nodeVersion.replace("v", "").split(".")[0], 10);
  const ok = major >= minMajor;
  return {
    ok,
    version: nodeVersion,
    message: ok
      ? `✅ Node.js: ${nodeVersion}`
      : `❌ Node.js: ${nodeVersion} (requer >= ${minMajor})`,
  };
}

/**
 * @param {number} n - bytes
 * @returns {string}
 */
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {string[]} args
 * @returns {{ fix: boolean, port: number|null, help: boolean }}
 */
function parseArgs(args = []) {
  const opts = { fix: false, port: null, help: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--fix" || a === "-f") opts.fix = true;
    else if ((a === "--port" || a === "-p") && args[i + 1]) {
      opts.port = parseInt(args[++i], 10);
    } else if (a === "--help" || a === "-h") {
      opts.help = true;
    }
  }
  return opts;
}

module.exports = { checkNodeVersion, formatBytes, parseArgs };
