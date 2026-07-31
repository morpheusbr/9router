const fs = require("fs");
const path = require("path");
const { getCliDataDir } = require("../constants");
const { selectMenu, pause } = require("../utils/input");

function getBackupDir() {
  const dir = path.join(getCliDataDir(), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function run(args) {
  const [action, name] = args || [];
  const backupDir = getBackupDir();

  if (action === "create" || action === "save") {
    return createBackup(name);
  }

  // Interactive TUI Loop
  while (true) {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith(".json"));
    
    const items = [
      { label: "📸 Criar Novo Snapshot / Backup", action: "create" },
      ...files.map(f => {
        const filePath = path.join(backupDir, f);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
          return { label: `📦 ${content.name} (${content.createdAt})`, file: f, action: "view" };
        } catch {
          return { label: `📦 ${f}`, file: f, action: "view" };
        }
      }),
      { label: "🚪 Voltar", action: "back" }
    ];

    const idx = await selectMenu("Gerenciador de Backups & Snapshots", items, 0, "Escolha uma ação ou selecione um snapshot para detalhes:");
    if (idx === -1 || items[idx].action === "back") break;

    const selected = items[idx];
    if (selected.action === "create") {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await createBackup(`snapshot-${timestamp}`);
      await pause();
    } else if (selected.action === "view") {
      const filePath = path.join(backupDir, selected.file);
      console.log(`\n📌 Snapshot File: ${filePath}`);
      console.log(fs.readFileSync(filePath, "utf8"));
      await pause();
    }
  }

  return 0;
}

async function createBackup(customName) {
  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotName = customName || `snapshot-${timestamp}`;
  const targetFile = path.join(backupDir, `${snapshotName}.json`);

  const dbPath = path.join(getCliDataDir(), "db", "data.sqlite");
  const snapshotData = {
    createdAt: new Date().toISOString(),
    name: snapshotName,
    hasDatabase: fs.existsSync(dbPath),
  };

  fs.writeFileSync(targetFile, JSON.stringify(snapshotData, null, 2), "utf8");
  console.log(`\n✅ Snapshot '${snapshotName}' criado com sucesso!`);
  console.log(`📁 Salvo em: ${targetFile}\n`);
  return 0;
}

module.exports = { run };
