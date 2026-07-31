const { selectMenu, pause } = require("../utils/input");
const { makeRequest } = require("../api/client");
const readline = require("readline");

function promptInput(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function run(args) {
  const [action, alias, model] = args || [];

  if (action === "set") {
    if (!alias || !model) {
      console.log("❌ Uso: hiperrouter alias set <alias> <modelo>");
      return 1;
    }
    return setAlias(alias, model);
  }
  if (action === "delete" || action === "rm") {
    if (!alias) {
      console.log("❌ Uso: hiperrouter alias rm <alias>");
      return 1;
    }
    return deleteAlias(alias);
  }

  // TUI Loop
  while (true) {
    console.log(`\n⏳ Buscando aliases ativos...`);
    const res = await makeRequest("GET", "/api/models/alias");
    const aliases = (res.data && res.data.aliases) ? res.data.aliases : {};

    const items = [
      { label: "➕ Criar / Atualizar Alias de Modelo", action: "add" },
      { label: "❌ Deletar Alias", action: "rm" },
      ...Object.entries(aliases).map(([a, m]) => ({
        label: `🔀 ${a} ➔ ${m}`,
        aliasName: a,
        targetModel: m,
        action: "view"
      })),
      { label: "🚪 Voltar", action: "back" }
    ];

    const idx = await selectMenu("Gerenciador de Aliases de Modelos", items, 0, "Redirecione nomes de modelos no proxy:");
    if (idx === -1 || items[idx].action === "back") break;

    const selected = items[idx];
    if (selected.action === "add") {
      const aliasName = await promptInput("Nome do Alias (ex: gpt-4o): ");
      if (aliasName) {
        const targetModel = await promptInput(`Redirecionar '${aliasName}' para qual modelo? (ex: claude-3.5-sonnet): `);
        if (targetModel) {
          await setAlias(aliasName, targetModel);
          await pause();
        }
      }
    } else if (selected.action === "rm") {
      const aliasName = await promptInput("Nome do Alias para remover (ex: gpt-4o): ");
      if (aliasName) {
        await deleteAlias(aliasName);
        await pause();
      }
    } else if (selected.action === "view") {
      console.log(`\n📌 Alias: ${selected.aliasName} -> ${selected.targetModel}`);
      await pause();
    }
  }

  return 0;
}

async function setAlias(alias, model) {
  console.log(`⏳ Criando alias: ${alias} -> ${model}...`);
  const res = await makeRequest("PUT", "/api/models/alias", { alias, model });
  if (res.success || res.status === 200) {
    console.log(`✅ Alias ${alias} redirecionado para ${model} com sucesso!`);
    return 0;
  } else {
    console.log(`❌ Erro:`, res.error || "Falha na requisição");
    return 1;
  }
}

async function deleteAlias(alias) {
  console.log(`⏳ Deletando alias ${alias}...`);
  const res = await makeRequest("DELETE", `/api/models/alias?alias=${encodeURIComponent(alias)}`);
  if (res.success || res.status === 200) {
    console.log(`✅ Alias ${alias} deletado.`);
    return 0;
  } else {
    console.log(`❌ Erro:`, res.error || "Falha na requisição");
    return 1;
  }
}

module.exports = { run };
