const { selectMenu, pause } = require("../utils/input");
const configStore = require("../utils/configStore");

const PERSONAS = [
  { id: "god", name: "🚀 God Mode (Padrão Sênior Full-Stack)", desc: "Orquestrador completo com autorização para executar scripts e aplicar patches." },
  { id: "architect", name: "🏗️ Architect Mode", desc: "Foco em design de software, diagramas de fluxo e planejamento técnico sem alterar código." },
  { id: "qa", name: "🛡️ QA & Security Auditor", desc: "Revisão rigorosa de código com foco em prevenção contra bugs, SSRF e Zod." },
  { id: "refactor", name: "⚡ Code Refactoring Specialist", desc: "Otimizador de performance, legibilidade e remoção de código morto." }
];

async function run(args) {
  const currentPersona = configStore.get("activePersona") || "god";

  const items = PERSONAS.map(p => ({
    label: `${p.id === currentPersona ? "★ " : "☆ "}${p.name}`,
    desc: p.desc,
    id: p.id
  }));

  items.push({ label: "🚪 Voltar", id: "back" });

  const idx = await selectMenu("Seletor de Personas & System Prompt", items, 0, "Escolha o modo de atuação da IA para a sessão:");
  if (idx !== -1 && items[idx].id !== "back") {
    const selected = items[idx];
    configStore.set("activePersona", selected.id);
    console.log(`\n✅ Persona alterada para: ${selected.name}`);
    console.log(`📌 ${selected.desc}\n`);
    await pause();
  }

  return 0;
}

module.exports = { run };
