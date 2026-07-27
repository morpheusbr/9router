const rawCmd = `  cat << EOF > file.txt
    npm run build
  EOF
  ls -la`;

let inHereDoc = false;
let hereDocMarker = "";

const finalCmd = rawCmd.split('\n').map(line => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return line;
  
  if (inHereDoc && t === hereDocMarker) {
    inHereDoc = false;
    return line;
  }
  if (inHereDoc) return line;

  const hereDocMatch = t.match(/<<\s*-?\s*['"]?([a-zA-Z0-9_-]+)['"]?/);
  if (hereDocMatch) {
    inHereDoc = true;
    hereDocMarker = hereDocMatch[1];
  }

  const knownCommands = /^(npm|npx|node|git|grep|cat|ls|rm|cd|pwd|cp|mv|sed|awk|curl|wget|docker|pm2|graphify|yarn|pnpm|bun|echo|mkdir|touch|chmod|chown|sudo|apt|apt-get|find|tar|unzip|zip)\b/;
  
  if (!t.startsWith('rtk ') && knownCommands.test(t)) {
    return line.replace(/^\s*/, '$&rtk ');
  }
  
  return line;
}).join('\n');

console.log(finalCmd);
