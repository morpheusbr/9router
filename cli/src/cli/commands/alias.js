const { makeRequest } = require("../api/client");

async function run(args) {
  const [action, alias, model] = args;

  if (action === "set") {
    if (!alias || !model) {
      console.log("❌ Uso incorreto. Exemplo: rtk alias set gpt-4o claude-3.5-sonnet");
      return 1;
    }
    console.log(`⏳ Criando alias: ${alias} -> ${model}...`);
    const res = await makeRequest("PUT", "/api/models/alias", { alias, model });
    if (res.success) {
      console.log(`✅ Alias ${alias} redirecionado para ${model} com sucesso!`);
      return 0;
    } else {
      console.log(`❌ Erro:`, res.error || "Falha desconhecida");
      return 1;
    }
  }

  if (action === "list" || !action) {
    console.log(`⏳ Buscando aliases ativos...`);
    const res = await makeRequest("GET", "/api/models/alias");
    if (res.data && res.data.aliases) {
      const aliases = res.data.aliases;
      if (Object.keys(aliases).length === 0) {
        console.log(`ℹ️  Nenhum alias configurado.`);
      } else {
        console.log(`\n📋 Aliases Ativos:`);
        for (const [k, v] of Object.entries(aliases)) {
          console.log(`  - ${k} -> ${v}`);
        }
        console.log("");
      }
      return 0;
    } else {
      console.log(`❌ Erro ao buscar aliases.`, res.error || "");
      return 1;
    }
  }

  if (action === "delete" || action === "rm") {
    if (!alias) {
      console.log("❌ Uso incorreto. Exemplo: rtk alias delete gpt-4o");
      return 1;
    }
    console.log(`⏳ Deletando alias ${alias}...`);
    const res = await makeRequest("DELETE", `/api/models/alias?alias=${encodeURIComponent(alias)}`);
    if (res.success) {
      console.log(`✅ Alias ${alias} deletado.`);
      return 0;
    } else {
      console.log(`❌ Erro:`, res.error || "Falha desconhecida");
      return 1;
    }
  }

  console.log(`❌ Comando desconhecido. Use: list, set, ou delete`);
  return 1;
}

module.exports = { run };
