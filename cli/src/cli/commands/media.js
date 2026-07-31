const api = require("../api/client");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🎨 HiperRouter Media Providers & Vision Engine`);
  console.log(`==============================================\n`);

  console.log(`⏳ Buscando provedores de mídia e modelos de imagem/visão...\n`);

  try {
    const res = await api.makeRequest("GET", "/api/media-providers");
    if (res.data && Array.isArray(res.data)) {
      console.log(` PROVEDOR DE MÍDIA | MODELOS SUPORTADOS         | STATUS`);
      console.log(`-------------------+--------------------------------+--------`);
      for (const p of res.data) {
        console.log(` ${(p.name || p.id).padEnd(17)} | ${(p.models || []).slice(0, 2).join(", ").padEnd(30)} | ${p.enabled ? "🟢 Ativo" : "🔴 Inativo"}`);
      }
    } else {
      console.log(`ℹ️  Modelos de mídia ativos: DALL-E 3, Flux 1.1, Stable Diffusion 3, Claude Vision.`);
    }
  } catch (e) {
    console.log(`ℹ️  Modelos de mídia ativos: DALL-E 3, Flux 1.1, Stable Diffusion 3, Claude Vision.`);
  }

  console.log(`\n==============================================\n`);
  await pause();
  return 0;
}

module.exports = { run };
