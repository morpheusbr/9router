const api = require("../api/client");
const { selectMenu, pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🔤 HiperRouter Token Saver & Compression Manager`);
  console.log(`=================================================\n`);

  while (true) {
    console.log(`⏳ Buscando configurações do Token Saver...`);
    let currentConfig = { enabled: true, compressionLevel: "medium", removeComments: true };
    try {
      const res = await api.makeRequest("GET", "/api/token-saver/config");
      if (res.data) currentConfig = { ...currentConfig, ...res.data };
    } catch (e) {}

    const items = [
      { label: `⚡ Status: ${currentConfig.enabled ? "🟢 ATIVADO" : "🔴 DESATIVADO"}`, action: "toggle" },
      { label: `📊 Nível de Compressão: [${currentConfig.compressionLevel.toUpperCase()}]`, action: "level" },
      { label: `🧹 Remover Comentários e Espaços Redundantes: ${currentConfig.removeComments ? "Sim" : "Não"}`, action: "comments" },
      { label: "🚪 Voltar", action: "back" }
    ];

    const idx = await selectMenu("Token Saver & Compression Rules", items, 0, "Economize até 40% de tokens por requisição:");
    if (idx === -1 || items[idx].action === "back") break;

    const selected = items[idx];
    if (selected.action === "toggle") {
      currentConfig.enabled = !currentConfig.enabled;
      await api.makeRequest("POST", "/api/token-saver/config", currentConfig);
      console.log(`\n✅ Token Saver ${currentConfig.enabled ? "Ativado" : "Desativado"}.`);
      await pause();
    } else if (selected.action === "level") {
      const levels = ["low", "medium", "high", "aggressive"];
      const nextLevel = levels[(levels.indexOf(currentConfig.compressionLevel) + 1) % levels.length];
      currentConfig.compressionLevel = nextLevel;
      await api.makeRequest("POST", "/api/token-saver/config", currentConfig);
      console.log(`\n✅ Nível de compressão alterado para: ${nextLevel.toUpperCase()}`);
      await pause();
    } else if (selected.action === "comments") {
      currentConfig.removeComments = !currentConfig.removeComments;
      await api.makeRequest("POST", "/api/token-saver/config", currentConfig);
      console.log(`\n✅ Remoção de comentários alterada.`);
      await pause();
    }
  }

  return 0;
}

module.exports = { run };
