const fs = require("fs");
const path = require("path");

function readFilesByWildcard(pattern) {
  const files = [];
  const dir = path.dirname(pattern);
  const baseNamePattern = path.basename(pattern).replace(/\*/g, '.*');
  const regex = new RegExp('^' + baseNamePattern + '$');

  try {
    const fullDir = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(fullDir)) return files;
    
    const entries = fs.readdirSync(fullDir);
    for (const entry of entries) {
      if (regex.test(entry)) {
        const fullPath = path.join(fullDir, entry);
        if (fs.statSync(fullPath).isFile()) {
          files.push(fullPath);
        }
      }
    }
  } catch(e) {}
  return files;
}

module.exports = { readFilesByWildcard };
