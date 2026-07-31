const fs = require("fs");
const path = require("path");
const { getCliDataDir } = require("../constants");

function generateZshCompletion() {
  return `#compdef hiperrouter

_hiperrouter() {
  local -a commands
  commands=(
    'doctor:Diagnóstico do sistema (Node, SQLite, portas)'
    'key:Gerenciar chaves de provedores de AI'
    'stats:Exibir telemetria de uso e consumo de tokens'
    'backup:Criar ou restaurar backup de arquivos'
    'sync:Configurar autocompletar em editores (VSCode, Kilo, OpenCode)'
    'alias:Gerenciar apelidos de modelos'
    'task:Executar agente autônomo em background'
    'xai:Gerar vídeos Grok Imagine'
  )

  _describe 'command' commands
}

_hiperrouter "$@"
`;
}

function generateBashCompletion() {
  return `# bash completion for hiperrouter
_hiperrouter_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local cmds="doctor key stats backup sync alias task xai --port --host --help --version"
  COMPREPLY=( $(compgen -W "\${cmds}" -- \${cur}) )
}
complete -F _hiperrouter_completions hiperrouter
`;
}

async function run(args) {
  const shell = args[0] ? args[0].toLowerCase() : "zsh";

  console.log(`\n⚡ HiperRouter Shell Autocompletion Generator`);
  console.log(`============================================\n`);

  if (shell === "zsh") {
    const script = generateZshCompletion();
    const targetDir = path.join(process.env.HOME || "~", ".zsh", "completion");
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, "_hiperrouter");
    fs.writeFileSync(targetPath, script, "utf8");

    console.log(`✅ Script Zsh gerado em: ${targetPath}`);
    console.log(`👉 Adicione ao seu ~/.zshrc se necessário:`);
    console.log(`   fpath=(${targetDir} $fpath)`);
    console.log(`   autoload -U compinit && compinit\n`);
    return 0;
  } else if (shell === "bash") {
    const script = generateBashCompletion();
    const targetPath = path.join(process.env.HOME || "~", ".hiperrouter-completion.bash");
    fs.writeFileSync(targetPath, script, "utf8");

    console.log(`✅ Script Bash gerado em: ${targetPath}`);
    console.log(`👉 Adicione ao seu ~/.bashrc:`);
    console.log(`   source ${targetPath}\n`);
    return 0;
  } else {
    console.log(`❌ Shell não suportado: ${shell}. Use 'zsh' ou 'bash'.`);
    return 1;
  }
}

module.exports = { run };
