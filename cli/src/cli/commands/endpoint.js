const { DEFAULT_PORT } = require("../constants");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🔌 HiperRouter Proxy Endpoint Configurator & Ping Tester`);
  console.log(`=========================================================\n`);

  console.log(` 🌐 Base URL:                http://localhost:${DEFAULT_PORT}`);
  console.log(` 💬 OpenAI Compatible URL:  http://localhost:${DEFAULT_PORT}/v1/chat/completions`);
  console.log(` 🤖 Anthropic Messages URL: http://localhost:${DEFAULT_PORT}/v1/messages`);
  console.log(` 🔑 API Key:                hiperrouter-local-key`);

  console.log(`\n⏳ Testando tempo de resposta do servidor (Ping)...`);

  const start = Date.now();
  try {
    const res = await fetch(`http://localhost:${DEFAULT_PORT}/api/status`);
    const elapsed = Date.now() - start;
    if (res.ok) {
      console.log(` ✅ Status: 200 OK — Resposta obtida em ${elapsed}ms!`);
    } else {
      console.log(` ⚠️ Status: ${res.status} — Servidor ativo.`);
    }
  } catch (e) {
    console.log(` ❌ Erro na conexão: ${e.message}`);
  }

  console.log(`\n=========================================================\n`);
  await pause();
  return 0;
}

module.exports = { run };
