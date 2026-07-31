const api = require("../api/client");
const { selectMenu, pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🌍 HiperRouter AI Translator & Multilingual Proxy`);
  console.log(`================================================\n`);

  while (true) {
    console.log(`⏳ Buscando status do tradutor...`);
    let currentConfig = { enabled: false, targetLang: "en", autoTranslatePrompt: true };
    try {
      const res = await api.makeRequest("GET", "/api/translator/config");
      if (res.data) currentConfig = { ...currentConfig, ...res.data };
    } catch (e) {}

    const items = [
      { label: `🌐 Tradução Automática: ${currentConfig.enabled ? "🟢 ATIVADA" : "🔴 DESATIVADA"}`, action: "toggle" },
      { label: `🎯 Idioma Alvo para o Modelo: [${currentConfig.targetLang.toUpperCase()}]`, action: "lang" },
      { label: "🚪 Voltar", action: "back" }
    ];

    const idx = await selectMenu("AI Translator Manager", items, 0, "Tradução transparente de prompts e respostas:");
    if (idx === -1 || items[idx].action === "back") break;

    const selected = items[idx];
    if (selected.action === "toggle") {
      currentConfig.enabled = !currentConfig.enabled;
      await api.makeRequest("POST", "/api/translator/config", currentConfig);
      console.log(`\n✅ Tradutor automático ${currentConfig.enabled ? "Ativado" : "Desativado"}.`);
      await pause();
    } else if (selected.action === "lang") {
      const langs = ["en", "pt", "es", "fr", "de"];
      const nextLang = langs[(langs.indexOf(currentConfig.targetLang) + 1) % langs.length];
      currentConfig.targetLang = nextLang;
      await api.makeRequest("POST", "/api/translator/config", currentConfig);
      console.log(`\n✅ Idioma alvo alterado para: ${nextLang.toUpperCase()}`);
      await pause();
    }
  }

  return 0;
}

module.exports = { run };
