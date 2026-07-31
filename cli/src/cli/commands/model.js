const { selectModelFromList } = require("../utils/modelSelector");
const configStore = require("../utils/configStore");

async function run(args) {
  console.log(`\n🤖 HiperRouter - Seleção e Alteração de Modelo`);
  console.log(`==============================================\n`);

  const currentModel = configStore.get("defaultModel") || "gpt-4o";
  console.log(`📌 Modelo atual configurado: ${currentModel}\n`);

  const selectedModel = await selectModelFromList("Escolha o novo Modelo Padrão:", currentModel);

  if (selectedModel) {
    configStore.set("defaultModel", selectedModel);
    
    // Add to recent models in configStore
    const recent = configStore.getArray("recentModels");
    const updatedRecent = [selectedModel, ...recent.filter(m => m !== selectedModel)].slice(0, 5);
    configStore.set("recentModels", updatedRecent);

    console.log(`\n✅ Modelo alterado com sucesso para: ${selectedModel}\n`);
    return 0;
  } else {
    console.log(`\n⏭️  Nenhuma alteração feita.\n`);
    return 0;
  }
}

module.exports = { run };
