const fs = require('fs');
const path = require('path');

const rootDir = '/home/www/HiperRouter';
const ignoreDirs = ['node_modules', '.git', '.HiperRouter', '.HiperRouter', '.next-cli-build', 'graphify-out'];

function walkAndReplace(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!ignoreDirs.includes(file)) {
        walkAndReplace(fullPath);
      }
    } else {
      if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.sqlite')) continue;
      
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('.HiperRouter')) {
          const newContent = content.replace(/\.HiperRouter/g, '.HiperRouter');
          fs.writeFileSync(fullPath, newContent, 'utf8');
          console.log(`Updated: ${fullPath}`);
        }
      } catch (err) {
        // skip binary or unreadable files
      }
    }
  }
}

walkAndReplace(rootDir);

// Rename the actual folder
const oldPath = path.join(rootDir, '.HiperRouter');
const newPath = path.join(rootDir, '.HiperRouter');
if (fs.existsSync(oldPath)) {
  fs.renameSync(oldPath, newPath);
  console.log(`Renamed folder ${oldPath} to ${newPath}`);
}
