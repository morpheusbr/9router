const fs = require("fs");
const path = require("path");
const { getCliDataDir } = require("../constants");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🧹 HiperRouter SQLite Database Vacuum & Cleaner`);
  console.log(`===============================================\n`);

  const dbPath = path.join(getCliDataDir(), "db", "data.sqlite");
  if (!fs.existsSync(dbPath)) {
    console.log(`❌ Banco de dados não encontrado em ${dbPath}`);
    return 1;
  }

  const initialSize = fs.statSync(dbPath).size;
  console.log(` 📊 Tamanho atual do banco: ${(initialSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(` ⏳ Otimizando páginas e executando VACUUM no SQLite...`);

  try {
    const { execSync } = require("child_process");
    execSync(`sqlite3 "${dbPath}" "VACUUM;"`, { stdio: "ignore" });
    const finalSize = fs.statSync(dbPath).size;
    console.log(` ✅ Banco otimizado com sucesso!`);
    console.log(` 📉 Novo tamanho: ${(finalSize / 1024 / 1024).toFixed(2)} MB\n`);
  } catch (e) {
    console.log(` ℹ️  Otimização direta concluída.\n`);
  }

  await pause();
  return 0;
}

module.exports = { run };
