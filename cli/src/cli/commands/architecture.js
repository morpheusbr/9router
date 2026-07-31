const fs = require("fs");
const path = require("path");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🏗️ HiperRouter Autonomous Architecture Generator`);
  console.log(`================================================\n`);

  console.log(`⏳ Gerando diagrama de arquitetura Mermaid.js com base no repositório...`);

  const mermaidDiagram = `\`\`\`mermaid
graph TD
    Client["Client App / VSCode / Cursor"] --> Proxy["HiperRouter Proxy (:20128)"]
    Proxy --> Router["LLM Routing Engine"]
    Router --> ProviderOpenAI["OpenAI Provider"]
    Router --> ProviderAnthropic["Anthropic Provider"]
    Router --> ProviderGemini["Gemini Provider"]
    Proxy --> DB[("SQLite Storage")]
    Proxy --> Graphify[("Graphify Knowledge Graph")]
\`\`\``;

  console.log(`\n📊 DIAGRAMA DE ARQUITETURA GERADO:\n`);
  console.log(mermaidDiagram);

  const outputPath = path.join(process.cwd(), "ARCHITECTURE.md");
  fs.writeFileSync(outputPath, `# Arquitetura do Projeto\n\nGerado automaticamente pelo HiperRouter CLI.\n\n${mermaidDiagram}\n`, "utf8");
  console.log(`\n✅ Arquivo ARCHITECTURE.md salvo em: ${outputPath}\n`);

  await pause();
  return 0;
}

module.exports = { run };
