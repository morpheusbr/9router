const fs = require("fs");
const path = require("path");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🧠 HiperRouter Memory & Context Inspector`);
  console.log(`==========================================\n`);

  const graphReportPath = path.join(process.cwd(), "graphify-out", "GRAPH_REPORT.md");

  if (fs.existsSync(graphReportPath)) {
    try {
      const stats = fs.statSync(graphReportPath);
      const content = fs.readFileSync(graphReportPath, "utf8");
      const lines = content.split("\n");
      
      console.log(`✅ Grafo de Conhecimento do Projeto Encontrado!`);
      console.log(` 📁 Caminho: ${graphReportPath}`);
      console.log(` 📅 Última Atualização: ${stats.mtime.toLocaleString("pt-BR")}`);
      console.log(` 📊 Total de Linhas de Resumo: ${lines.length}`);
      console.log(`\n--- Primeiras 15 linhas de memória do grafo ---`);
      console.log(lines.slice(0, 15).join("\n"));
      console.log(`----------------------------------------------\n`);
    } catch (e) {
      console.log(`❌ Erro ao ler memória do grafo: ${e.message}`);
    }
  } else {
    console.log(`ℹ️  Nenhum grafo 'graphify-out' encontrado na pasta atual (${process.cwd()}).`);
    console.log(`💡 Dica: Rode 'graphify update .' para gerar a memória inicial do projeto.\n`);
  }

  return 0;
}

module.exports = { run };
