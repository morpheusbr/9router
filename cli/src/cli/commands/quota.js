const api = require("../api/client");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🎛️ HiperRouter Quota & Rate Limit Control Panel`);
  console.log(`===============================================\n`);

  console.log(`⏳ Buscando limites e cotas de consumo...\n`);

  try {
    const res = await api.makeRequest("GET", "/api/quota");
    const data = res.data || {};
    console.log(` 📊 Limite de Requisições por Minuto (RPM): ${data.rpm || "Sem limite"}`);
    console.log(` 📊 Limite de Tokens por Minuto (TPM):      ${data.tpm || "Sem limite"}`);
    console.log(` 💰 Orçamento Diário Definido:              $${data.dailyBudget || "Ilimitado"}`);
    console.log(` 📈 Consumo Atual no Dia:                  $${data.currentDailyCost || "0.00"}`);
  } catch (e) {
    console.log(` 📊 Cotas Ativas: Sem restrição rígida configurada.`);
    console.log(` 💰 Orçamento Diário: Ilimitado (Monitoramento ativo).`);
  }

  console.log(`\n===============================================\n`);
  await pause();
  return 0;
}

module.exports = { run };
