const { DEFAULT_PORT } = require("../constants");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n📡 HiperRouter Live Log Stream`);
  console.log(`=================================\n`);
  console.log(`⏳ Conectando ao feed de logs em tempo real (http://localhost:${DEFAULT_PORT}/api/usage/stream)...`);
  console.log(`👉 Pressione Ctrl+C para parar a visualização de logs.\n`);

  try {
    const res = await fetch(`http://localhost:${DEFAULT_PORT}/api/usage/stream`);
    if (!res.ok || !res.body) {
      console.log(`ℹ️  Endpoint de stream não disponível no momento. Exibindo últimos registros de logs do banco...`);
      const api = require("../api/client");
      const logsRes = await api.makeRequest("GET", "/api/usage/logs?limit=10");
      if (logsRes.data) {
        console.log(JSON.stringify(logsRes.data, null, 2));
      }
      await pause();
      return 0;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      process.stdout.write(chunk);
    }
  } catch (e) {
    console.log(`❌ Erro no stream de logs: ${e.message}\n`);
    await pause();
  }

  return 0;
}

module.exports = { run };
