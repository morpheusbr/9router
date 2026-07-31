<div align="center">
  <img src="./images/hiperrouter.png?1" alt="HiperRouter Dashboard" width="800"/>
  
  # HiperRouter
  
  **The Ultimate AI Router & Assistant (Advanced HiperRouter Fork)**<br>
  **O Roteador e Assistente de IA Definitivo (Fork Avançado do HiperRouter)**

  <br>

  [![English](https://img.shields.io/badge/Language-English-blue)](#-english-version)
  [![Português](https://img.shields.io/badge/Idioma-Português-green)](#-versão-em-português)
</div>

---

## 🇺🇸 English Version

### 🚀 About HiperRouter

**HiperRouter** started as a fork of the `hiperrouter` project but has evolved into a powerful, standalone development tool. It combines token savings (via RTK) with a super-intelligent **God Mode AI Agent** that lives directly in your terminal, acting as your Assistant Senior Software Engineer.

We maintain full proxy compatibility for tools like Claude Code, Cursor, Cline, and others, while injecting local autonomy superpowers.

---

### ✨ Key Features (Fork Exclusives)

- 🧠 **Integrated God Mode AI Agent**: A conversational CLI agent capable of reading code, understanding architecture, and autonomously proposing/modifying files with surgical precision.
- 🛡️ **Enterprise Security**:
  - **Secret Leak Guard**: Automatic masking of passwords, JWTs, and keys (`sk-...`, `ghp_...`) in contexts sent to the AI (`[REDACTED_SECRET]`).
  - **Auto-Checkpoint & `/rollback`**: Temporary Git snapshots before edits. Type `/rollback` to instantly revert any AI changes.
  - **Infinite Loop & Token Burn Guard**: Smart blocking against self-healing infinite loops.
  - **Immutable Audit Log**: Records security events in `.HiperRouter/audit.log` (`/audit`).
- 🎨 **Superior Developer Experience (DX/UX)**:
  - **Visual Diff Preview**: Colored diffs (`-` red / `+` green) before approving any patch.
  - **Tab Completion**: Press `Tab` after `/` to autocomplete any command.
  - **Productivity Shortcuts**: `/copy`, `/copy-code`, `/paste` (multiline), `/save` (export chat to MD), `/stats` (token telemetry).
  - **Built-in Help Center**: Detailed `/help` command covering all features.
- 👑 **Graphify (Knowledge Graph) Integration**: Complete and continuous mapping of your codebase (`graphify-out`) with reactive reloading in the chat.
- 🛠️ **Self-Healing Bash**: Executes scripts, reads terminal errors, and performs iterative self-correction.
- ⚡ **RTK - Rust Token Killer**: Replaces raw `bash` in internal operations, saving up to 90% of token overhead.
- 📦 **Zero Downtime Build**: Build flow protected by a shell script (`build-seguro.sh`) without taking the router down in production.

---

### 📖 God Mode CLI Commands (`/help`)

| Command | Description |
|---|---|
| `/plan <instructions>` | Planning Mode: Generates architecture/plan without altering code. |
| `/code <instructions>` | Coding Mode: Simulates architecture and QA sub-agents before coding. |
| `/test <file>` | Test Generator: Analyzes the file and creates unit tests. |
| `/commit` | Auto-Commit: Analyzes the git diff and performs a semantic commit. |
| `/review` | Code Audit: Reviews the git diff looking for bugs, Zod issues, and SSRF. |
| `/read <file>` | Reader: Injects the content of a local file into the conversation. |
| `/model` | Change Model: Interactive menu with ↑↓ arrows to swap the LLM. |
| `/history [n]` | History: Displays the last N messages exchanged in the chat. |
| `/status` | API Status: Checks if the proxy server is responding. |
| `/undo` | Restore Backup: Reverts the file to the latest `.bak` backup. |
| `/save [file]` | Save Chat: Exports the conversation to a Markdown file. |
| `/copy` | Copy Response: Copies the entire last AI response to the clipboard. |
| `/copy-code` | Copy Code: Copies only the last code block to the clipboard. |
| `/paste` | Multiline Mode: Buffer to paste extensive prompts or logs. |
| `/rollback` | Repo Rollback: Reverts git to the pre-patch/command snapshot. |
| `/audit [n]` | Audit Log: Displays events saved in `.HiperRouter/audit.log`. |
| `/stats` | Telemetry: Displays requests, tokens consumed, and session time. |
| `/help` | Help Center: Displays the detailed list of commands. |
| `/clear` | Clear Chat: Resets the message history and clears the screen. |
| `/exit` | Exit: Ends the HiperRouter Agent session. |

---

### 🔧 Project Structure

* `cli/` - Entry point for the God Mode AI Agent (`cli.js`) and the entire conversational shell.
* `src/` - Router logic, proxying, and heavy backend manipulation.
* `app/` - Next.js Dashboard application, compiled via `build-seguro.sh`.
* `.HiperRouter/` - Location for the database (SQLite), isolated contexts, audit logs (`audit.log`), and key states.

---

### ⚡ Quick Start

#### 📦 Option 1: Via NPM (Recommended)
Install the official package globally on your system to use it in any project:
```bash
npm install -g hiperrouter

# Run the HiperRouter Agent & Server
hiperrouter
```

#### 🚀 Option 2: Run directly without installing
Execute directly via `npx`:
```bash
npx hiperrouter
```

#### 🐳 Option 3: Via Docker
```bash
docker run -d --name hiperrouter -p 20128:20128 \
  -v "$HOME/.HiperRouter:/app/data" -e DATA_DIR=/app/data \
  morpheusbr/HiperRouter:latest
```

#### 💻 Option 4: From Source Code (Git Clone)
Clone the official GitHub repository:
```bash
git clone https://github.com/morpheusbr/HiperRouter.git
cd HiperRouter
npm install
node cli/cli.js
```

#### 🤖 Chatting with the AI (God Mode)
In the CLI terminal, the smart assistant will start automatically. Type `/help` at any time to see the list of available commands or press `Tab` to autocomplete.

---

### 🛡️ Rules and Development

This repository follows strict rules dictated by the `AGENTS.md` file. If you are an AI agent reading this document, remember:
1. **Zero `any` Policy** (Strict TypeScript).
2. Do not delete dead code without approval or a DEPRECATED flag.
3. ALWAYS update the graph with `rtk graphify update .` at the end of changes.
4. Use `rtk` before suggested or executed bash commands.

---

### 📄 License
We maintain the original roots. MIT License.

<br>
<hr>
<br>

## 🇧🇷 Versão em Português

### 🚀 Sobre o HiperRouter

O **HiperRouter** nasceu como um fork do projeto `hiperrouter`, mas evoluiu para se tornar uma poderosa ferramenta autônoma de desenvolvimento. Ele combina a economia de tokens (via RTK) com um **God Mode AI Agent** super inteligente que vive diretamente no seu terminal, atuando como um Engenheiro de Software Sênior assistente.

Nós mantemos a compatibilidade total de proxy para ferramentas como Claude Code, Cursor, Cline e outras, enquanto injetamos superpoderes de autonomia local.

---

### ✨ Nossos Diferenciais (Features Exclusivas do Fork)

- 🧠 **God Mode AI Agent Integrado**: Um agente conversacional em CLI capaz de ler código, entender arquitetura e propor/modificar arquivos autonomamente com alta precisão cirúrgica.
- 🛡️ **Defesas de Nível Militar (Enterprise Security)**:
  - **Secret Leak Guard**: Máscara automática de senhas, JWTs e chaves (`sk-...`, `ghp_...`) nos contextos enviados à IA (`[REDACTED_SECRET]`).
  - **Auto-Checkpoint & `/rollback`**: Snapshots temporários no Git antes de edições. Digite `/rollback` para reverter instantaneamente qualquer alteração da IA.
  - **Infinite Loop & Token Burn Guard**: Bloqueio inteligente contra loops infinitos de self-healing.
  - **Log de Auditoria Imutável**: Gravação de eventos de segurança em `.HiperRouter/audit.log` (`/audit`).
- 🎨 **Experiência de Desenvolvimento (DX/UX Superior)**:
  - **Visual Diff Preview**: Diffs coloridos (`-` vermelho / `+` verde) antes de aprovar qualquer patch.
  - **Tab Completion**: Pressione `Tab` após `/` para autocompletar qualquer comando.
  - **Atalhos Produtivos**: `/copy`, `/copy-code`, `/paste` (multilinhas), `/save` (exportar chat em MD), `/stats` (telemetria de tokens).
  - **Central de Ajuda Integrada**: Comando `/help` detalhando todos os comandos.
- 👑 **Graphify (Knowledge Graph) Integration**: Mapeamento completo e contínuo da sua codebase (`graphify-out`) com recarregamento reativo no chat.
- 🛠️ **Self-Healing Bash**: Executa scripts, lê erros de terminal e realiza auto-correção iterativa.
- ⚡ **RTK - Rust Token Killer**: Substituto do `bash` puro nas operações internas, poupando até 90% do overhead de tokens.
- 📦 **Build Seguro (Zero Downtime)**: Fluxo de compilação protegido por shell script (`build-seguro.sh`) sem derrubar o roteador em produção.

---

### 📖 Comandos do God Mode CLI (`/help`)

| Comando | Descrição |
|---|---|
| `/plan <instruções>` | Modo Planejamento: Gera arquitetura/plano sem alterar código. |
| `/code <instruções>` | Modo Coding: Simula subagentes de arquitetura e QA antes de codar. |
| `/test <arquivo>` | Gerador de Testes: Analisa o arquivo e cria os testes unitários. |
| `/commit` | Auto-Commit: Analisa o git diff e realiza um commit semântico. |
| `/review` | Auditoria de Código: Revisa o git diff buscando bugs, Zod e SSRF. |
| `/read <arquivo>` | Leitor: Injeta o conteúdo de um arquivo local na conversa. |
| `/model` | Trocar Modelo: Menu interativo com setas ↑↓ para trocar LLM. |
| `/history [n]` | Histórico: Exibe as últimas N mensagens trocadas no chat. |
| `/status` | Status API: Verifica se o servidor proxy está respondendo. |
| `/undo` | Restaurar Backup: Reverte o arquivo para o backup `.bak` mais recente. |
| `/save [arquivo]` | Salvar Chat: Exporta a conversa para um arquivo Markdown. |
| `/copy` | Copiar Resposta: Copia toda a última resposta da IA para o clipboard. |
| `/copy-code` | Copiar Código: Copia apenas o último bloco de código para o clipboard. |
| `/paste` | Modo Multilinhas: Buffer para colar prompts ou logs extensos. |
| `/rollback` | Rollback Repositório: Reverte git ao snapshot pré-patch/comando. |
| `/audit [n]` | Log de Auditoria: Exibe os eventos salvos em `.HiperRouter/audit.log`. |
| `/stats` | Telemetria: Exibe requisições, tokens consumidos e tempo de sessão. |
| `/help` | Central de Ajuda: Exibe a lista detalhada de comandos. |
| `/clear` | Limpar Chat: Reseta o histórico de mensagens e limpa a tela. |
| `/exit` | Sair: Encerra a sessão do HiperRouter Agent. |

---

### 🔧 Estrutura do Projeto

* `cli/` - Ponto de entrada do God Mode AI Agent (`cli.js`) e todo o shell conversacional.
* `src/` - Lógica do roteador, proxying e manipulação pesada de backend.
* `app/` - Aplicação Next.js de Dashboard, compilada via `build-seguro.sh`.
* `.HiperRouter/` - Local do banco de dados (SQLite), contextos isolados, logs de auditoria (`audit.log`) e estado das chaves.

---

### ⚡ Instalação & Começando Rápidamente (Quick Start)

#### 📦 Opção 1: Via NPM (Recomendado)
Instale o pacote oficial globalmente no seu sistema para usar em qualquer projeto:
```bash
npm install -g hiperrouter

# Executar o HiperRouter Agent & Server
hiperrouter
```

#### 🚀 Opção 2: Executar diretamente sem instalar
Execute diretamente usando `npx`:
```bash
npx hiperrouter
```

#### 🐳 Opção 3: Via Docker
```bash
docker run -d --name hiperrouter -p 20128:20128 \
  -v "$HOME/.HiperRouter:/app/data" -e DATA_DIR=/app/data \
  morpheusbr/HiperRouter:latest
```

#### 💻 Opção 4: A partir do Código-Fonte (Git Clone)
Clone o repositório oficial do GitHub:
```bash
git clone https://github.com/morpheusbr/HiperRouter.git
cd HiperRouter
npm install
node cli/cli.js
```

#### 🤖 Conversar com a IA (God Mode)
No terminal do CLI, o assistente inteligente iniciará automaticamente. Digite `/help` a qualquer momento para ver a lista de comandos disponíveis ou pressione `Tab` para autocompletar.

---

### 🛡️ Regras e Desenvolvimento

Este repositório segue regras rigorosas ditadas pelo arquivo `AGENTS.md`. Se você é um agente de IA lendo este documento, lembre-se:
1. **Zero `any` Policy** (TypeScript restrito).
2. Não delete código morto sem aprovação ou flag de DEPRECATED.
3. SEMPRE atualize o grafo com `rtk graphify update .` ao fim das mudanças.
4. Utilize `rtk` antes de comandos bash sugeridos ou rodados.

---

### 📄 Licença
Mantemos as raízes originais. MIT License.
