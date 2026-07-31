const fs = require("fs");
const path = require("path");
const { getCliDataDir } = require("../constants");
const { pause } = require("../utils/input");

async function run(args) {
  const [action, file] = args || [];

  console.log(`\n📦 HiperRouter Package Migration & Exporter`);
  console.log(`===========================================\n`);

  const dataDir = getCliDataDir();
  const exportPath = path.resolve(process.cwd(), file || "hiperrouter-config.pack.json");

  if (action === "import") {
    const importPath = path.resolve(process.cwd(), file || "hiperrouter-config.pack.json");
    if (!fs.existsSync(importPath)) {
      console.log(`❌ Arquivo de pacote não encontrado em ${importPath}`);
      await pause();
      return 1;
    }
    console.log(`⏳ Importando pacote de ${importPath}...`);
    try {
      const data = JSON.parse(fs.readFileSync(importPath, "utf8"));
      if (data.config) {
        const configPath = path.join(dataDir, "config.json");
        fs.writeFileSync(configPath, JSON.stringify(data.config, null, 2), "utf8");
      }
      console.log(`✅ Pacote importado com sucesso para ${dataDir}!`);
    } catch (e) {
      console.log(`❌ Erro na importação: ${e.message}`);
    }
    await pause();
    return 0;
  }

  // Default: Export
  console.log(`⏳ Exportando configurações de ${dataDir}...`);
  try {
    const configPath = path.join(dataDir, "config.json");
    let configData = {};
    if (fs.existsSync(configPath)) {
      configData = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }

    const pack = {
      version: "0.6.7",
      exportedAt: new Date().toISOString(),
      config: configData
    };

    fs.writeFileSync(exportPath, JSON.stringify(pack, null, 2), "utf8");
    console.log(`✅ Pacote exportado com sucesso para: ${exportPath}\n`);
  } catch (e) {
    console.log(`❌ Erro ao exportar pacote: ${e.message}`);
  }

  await pause();
  return 0;
}

module.exports = { run };
