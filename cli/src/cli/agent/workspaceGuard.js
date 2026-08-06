"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Resolve a user/tool path without allowing it to escape the agent workspace.
 * Existing symlinks are resolved so a link cannot bypass the boundary.
 */
function resolveWorkspacePath(workDir, inputPath, options = {}) {
  const allowMissing = options.allowMissing === true;
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new Error("Caminho obrigatório");
  }

  const root = fs.realpathSync(workDir);
  const candidate = path.resolve(root, inputPath);
  let checked = candidate;

  if (allowMissing) {
    while (!fs.existsSync(checked) && checked !== path.dirname(checked)) {
      checked = path.dirname(checked);
    }
  }

  const realCandidate = fs.realpathSync(checked);
  const relative = path.relative(root, realCandidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Caminho fora do diretório de trabalho");
  }

  return candidate;
}

module.exports = { resolveWorkspacePath };
