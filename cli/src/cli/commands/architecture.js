const fs = require("fs");
const path = require("path");
const { COLORS } = require("../utils/input");

async function run(args) {
  console.log(`\n🏗️  ${COLORS.bright}${COLORS.cyan}ARCHITECTURE GENERATOR${COLORS.reset}`);
  console.log(`${"─".repeat(50)}\n`);

  // Load graphify graph data
  const graphPath = path.join(process.cwd(), "graphify-out", "graph.json");
  if (!fs.existsSync(graphPath)) {
    console.log(`${COLORS.red}❌ graphify-out/graph.json não encontrado.${COLORS.reset}`);
    console.log(`${COLORS.dim}Execute 'rtk graphify update .' primeiro.${COLORS.reset}\n`);
    return 1;
  }

  console.log(`${COLORS.dim}Carregando grafo de dependências...${COLORS.reset}`);
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));

  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const communities = graph.communities || {};

  console.log(`  📊 ${nodes.length} nós │ ${edges.length} arestas │ ${Object.keys(communities).length} comunidades\n`);

  // Group nodes by community
  const communityMap = {};
  for (const [commId, members] of Object.entries(communities)) {
    for (const nodeId of members) {
      communityMap[nodeId] = commId;
    }
  }

  // Get top communities by size
  const sortedComms = Object.entries(communities)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8);

  // Build Mermaid diagram
  const mermaidLines = ['graph TD'];

  // Create subgraphs for top communities
  for (const [commId, members] of sortedComms) {
    const safeId = `cluster_${commId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    // Get a meaningful name from the first few members
    const memberNames = members.slice(0, 3).map(m => {
      const node = nodes.find(n => n.id === m);
      return node ? path.basename(node.label || node.id) : m;
    });
    const label = memberNames[0] || commId;

    mermaidLines.push(`    subgraph ${safeId}["${label}"]`);
    for (const nodeId of members.slice(0, 6)) {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        const safeNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
        const nodeLabel = path.basename(node.label || node.id).replace(/"/g, "'");
        mermaidLines.push(`        ${safeNodeId}["${nodeLabel}"]`);
      }
    }
    if (members.length > 6) {
      mermaidLines.push(`        ${safeId}_more["... +${members.length - 6} mais"]`);
    }
    mermaidLines.push('    end');
  }

  // Add edges (limited to top 50 for readability)
  const edgeSet = new Set();
  let edgeCount = 0;
  for (const edge of edges) {
    if (edgeCount >= 50) break;
    const src = (edge.source || edge.from || '').replace(/[^a-zA-Z0-9]/g, '_');
    const tgt = (edge.target || edge.to || '').replace(/[^a-zA-Z0-9]/g, '_');
    if (!src || !tgt || src === tgt) continue;
    const edgeKey = `${src}->${tgt}`;
    if (edgeSet.has(edgeKey)) continue;
    edgeSet.add(edgeKey);
    const label = edge.label ? `|${edge.label}|` : '';
    mermaidLines.push(`    ${src} -->${label} ${tgt}`);
    edgeCount++;
  }

  const mermaidBlock = '```mermaid\n' + mermaidLines.join('\n') + '\n```';

  // Print stats
  console.log(`${COLORS.bright}📊 ESTATÍSTICAS DO PROJETO:${COLORS.reset}`);
  console.log(`  🔹 Arquivos/Componentes: ${nodes.length}`);
  console.log(`  🔹 Dependências: ${edges.length}`);
  console.log(`  🔹 Módulos/Comunidades: ${Object.keys(communities).length}`);
  console.log(`  🔹 Top comunidades: ${sortedComms.map(([id, m]) => `${id}(${m.length})`).join(', ')}\n`);

  // Print diagram
  console.log(`${COLORS.bright}📐 DIAGRAMA MERMAID:${COLORS.reset}\n`);
  console.log(mermaidBlock);

  // Save to file
  const outputPath = path.join(process.cwd(), "ARCHITECTURE.md");
  const content = `# Arquitetura do Projeto\n\nGerado automaticamente em ${new Date().toLocaleString('pt-BR')}\n\n## Estatísticas\n\n- **${nodes.length}** componentes\n- **${edges.length}** dependências\n- **${Object.keys(communities).length}** módulos\n\n## Diagrama\n\n${mermaidBlock}\n\n## Top Módulos\n\n${sortedComms.map(([id, members]) => `- **${id}**: ${members.length} componentes`).join('\n')}\n`;

  fs.writeFileSync(outputPath, content, "utf8");
  console.log(`\n${COLORS.green}✅ ARCHITECTURE.md salvo!${COLORS.reset}`);
  console.log(`${COLORS.dim}Visualize com: npx @mermaid-js/mermaid-cli mmdc -i ARCHITECTURE.md -o arch.png${COLORS.reset}\n`);

  return 0;
}

module.exports = { run };
