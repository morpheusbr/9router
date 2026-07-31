const { makeRequest } = require("../api/client");

async function run(args) {
  console.log(`\n📊 HiperRouter Telemetria & Estatísticas`);
  console.log(`========================================\n`);

  console.log(`⏳ Coletando dados de uso...`);
  const res = await makeRequest("GET", "/api/stats");

  if (res.data) {
    const stats = res.data;
    console.log(` Total de Requisições: ${stats.totalRequests || 0}`);
    console.log(` 📥 Tokens de Entrada:  ${(stats.inputTokens || 0).toLocaleString()}`);
    console.log(` 📤 Tokens de Saída:   ${(stats.outputTokens || 0).toLocaleString()}`);
    console.log(` 💰 Custo Estimado:    $${(stats.estimatedCost || 0).toFixed(4)}`);
    console.log(` ⚡ Economia de Latência / Cache: ${stats.cacheHits || 0} hits`);

    if (stats.models && Object.keys(stats.models).length > 0) {
      console.log(`\n🤖 Uso por Modelo:`);
      for (const [model, count] of Object.entries(stats.models)) {
        console.log(`  - ${model}: ${count} requisições`);
      }
    }
    console.log("");
    return 0;
  } else {
    // Fallback display if server stats endpoint is simplified
    console.log(` 🟢 Servidor Ativo & Respondendo`);
    console.log(` ℹ️  Para métricas detalhadas em tempo real, acesse o Dashboard Web.\n`);
    return 0;
  }
}

module.exports = { run };
