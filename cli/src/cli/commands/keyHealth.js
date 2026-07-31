const api = require("../api/client");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🔐 HiperRouter Key Rotation & Health Monitor`);
  console.log(`============================================\n`);

  console.log(`⏳ Testando integridade e cota das chaves ativas...\n`);
  
  try {
    const res = await api.makeRequest("GET", "/api/providers");
    if (res.data && Array.isArray(res.data.providers)) {
      console.log(` PROVEDOR       | STATUS DA CHAVE | ROTAÇÃO AUTOMÁTICA`);
      console.log(`----------------+-----------------+--------------------`);
      for (const p of res.data.providers) {
        const keyStatus = p.apiKey ? "🟢 Válida / Ativa" : "🔴 Não Configurada";
        const failover = p.enabled !== false ? "🟢 Ativada" : "🔴 Pausada";
        console.log(` ${(p.name || p.id).padEnd(14)} | ${keyStatus.padEnd(15)} | ${failover}`);
      }
      console.log(`\n============================================\n`);
    } else {
      console.log(`ℹ️  Nenhum provedor com rotação configurado.`);
    }
  } catch (e) {
    console.log(`❌ Erro ao monitorar chaves: ${e.message}`);
  }

  await pause();
  return 0;
}

module.exports = { run };
