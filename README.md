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
- 🎨 **Superior Developer Experience (DX/UX Superior)**:
  - **Numbered TUI Menus**: Direct `[1]`..`[34]` keyboard shortcuts with zero-Enter instant selection and real-time filter.
  - **Full Web Parity**: 100% of Web Dashboard features available natively in CLI (`/tokensaver`, `/translator`, `/media`, `/quota`, `/consolelog`, `/endpoint`).
  - **International i18n**: Multi-language support (`pt-BR`, `en-US`, OS auto-detect).
  - **Auto-Approve Editing Guard**: Configurable autonomy levels (Always Ask, Auto-Approve Code Patches, Total Autonomous Mode).
  - **Safety Exit Guard**: Double `Ctrl+C` in 3 seconds to prevent accidental chat termination.
  - **Visual Diff Preview**: Colored diffs (`-` red / `+` green) before approving any patch.
  - **Tab Completion & Palette**: Press `Tab` for autocompletion or `Ctrl+K` for fuzzy Command Palette overlay.
  - **Productivity Tools**: Multi-Model Consensus (`/consensus`), SAST Security Audit (`/security`), Auto-Fix Test Runner (`/run-tests`), Mermaid Architecture (`/architecture`), Live HTTP Stream (`/logs`).

---

### 📖 God Mode CLI Commands (`/help`)

| Command | Description |
|---|---|
| `/menu` | Interactive Control Panel: Numbered TUI with instant `[1]`..`[34]` shortcuts. |
| `/plan <instructions>` | Planning Mode: Generates architecture/plan without altering code. |
| `/code <instructions>` | Coding Mode: Simulates architecture and QA sub-agents before coding. |
| `/consensus <prompt>` | Multi-Model Consensus: Parallel cross-synthesis between top 3 LLMs. |
| `/security` | SAST Security Scanner: Audits codebase for OWASP/CWE vulnerabilities. |
| `/run-tests` | Smart Test Runner: Executes tests with stack-trace auto-fixer. |
| `/architecture` | Architecture Generator: Generates Mermaid.js diagrams & spec file. |
| `/tokensaver` | Token Saver: Manages prompt compression rules & cost reduction. |
| `/translator` | AI Translator: Transparent real-time multilingual prompt proxy. |
| `/media` | Media Providers: Manages DALL-E, Flux, and Vision models. |
| `/quota` | Quota Manager: Controls RPM/TPM rate limits and daily budget cap. |
| `/consolelog` | System Logs: Displays raw PM2 and Node.js server logs. |
| `/endpoint` | Endpoint Inspector: Displays proxy URLs and checks ping latency. |
| `/logs` | Live Log Stream: Real-time HTTP proxy request monitor. |
| `/test <file>` | Test Generator: Analyzes the file and creates unit tests. |
| `/commit` | Auto-Commit: Analyzes the git diff and performs a semantic commit. |
| `/review` | Code Audit: Reviews the git diff looking for bugs, Zod issues, and SSRF. |
| `/model` | Change Model: Interactive menu with search and favorites. |
| `/personas` | Persona Selector: Switches AI agent persona (God, Architect, QA...). |
| `/playground` | Parallel Playground: Tests prompt across multiple models side-by-side. |
| `/vacuum` | SQLite Vacuum: Optimizes and defragments database storage. |
| `/search <query>` | Web Search: Searches the web directly inside the terminal. |
| `/pack` | Migration Pack: Exports/Imports complete configuration package. |
| `/status` | API Status: Checks if the proxy server is responding. |
| `/undo` | Restore Backup: Reverts the file to the latest `.bak` backup. |
| `/save [file]` | Save Chat: Exports the conversation to a Markdown file. |
| `/stats` | Telemetry: Displays requests, tokens consumed, and session time. |
| `/settings` | Settings: Configures tunnel, auth mode, language and approval mode. |
| `/help` | Help Center: Displays the detailed list of commands. |
| `/clear` | Clear Chat: Resets the message history and clears the screen. |
| `/exit` | Exit: Double `Ctrl+C` or command to end session. |

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
  - **Menus TUI Numerados**: Atalhos diretos de teclado `[1]`..`[34]` com seleção instantânea (sem dar Enter) e filtro em tempo real.
  - **Paridade Total com a Dashboard Web**: 100% dos recursos da interface web disponíveis nativamente no CLI (`/tokensaver`, `/translator`, `/media`, `/quota`, `/consolelog`, `/endpoint`).
  - **Suporte Multilíngue (i18n)**: Idiomas selecionáveis (`pt-BR`, `en-US` ou detecção automática do sistema).
  - **Modo de Aprovação e Edição Automática**: Controle o nível de autonomia do agente (Sempre Perguntar, Auto-Aprovar Edições de Código, Modo Autônomo Total).
  - **Proteção contra Saída Acidental**: Exige 2x `Ctrl+C` seguidos em até 3 segundos para sair da sessão.
  - **Visual Diff Preview**: Diffs coloridos (`-` vermelho / `+` verde) antes de aprovar qualquer patch.
  - **Tab Completion & Palette**: Pressione `Tab` para autocompletar ou `Ctrl+K` para abrir a Command Palette flutuante.
  - **Super Motores de Produtividade**: Consenso Multi-Modelo (`/consensus`), Varredura de Segurança SAST (`/security`), Executor de Testes com Auto-Fixer (`/run-tests`), Arquitetura em Mermaid (`/architecture`), Stream de Logs de Requisições (`/logs`).

---

### 📖 Comandos do God Mode CLI (`/help`)

| Comando | Descrição |
|---|---|
| `/menu` | Painel de Controle Interativo: TUI numerada com atalhos `[1]`..`[34]`. |
| `/plan <instruções>` | Modo Planejamento: Gera arquitetura/plano sem alterar código. |
| `/code <instruções>` | Modo Coding: Simula subagentes de arquitetura e QA antes de codar. |
| `/consensus <prompt>` | Consenso Multi-Modelo: Debate e síntese paralela de 3 LLMs. |
| `/security` | Scanner SAST: Varredura de segurança por vulnerabilidades OWASP/CWE. |
| `/run-tests` | Smart Test Runner: Executa suíte de testes com auto-fixer de stack trace. |
| `/architecture` | Gerador de Arquitetura: Cria diagramas Mermaid.js e arquivo de spec. |
| `/tokensaver` | Token Saver: Gerencia regras de compressão de prompt e redução de custo. |
| `/translator` | AI Translator: Tradutor de prompts multilíngue transparente e em tempo real. |
| `/media` | Provedores de Mídia: Gerencia modelos DALL-E, Flux e visão computacional. |
| `/quota` | Controle de Cotas: Define teto de requisições RPM/TPM e orçamento diário. |
| `/consolelog` | Logs do Sistema: Exibe logs brutos do servidor Node.js / PM2. |
| `/endpoint` | Endpoint Configurator: Exibe URLs do proxy e testa o tempo de ping. |
| `/logs` | Live Log Stream: Monitoramento de requisições HTTP em tempo real. |
| `/test <arquivo>` | Gerador de Testes: Analisa o arquivo e cria os testes unitários. |
| `/commit` | Auto-Commit: Analisa o git diff e realiza um commit semântico. |
| `/review` | Auditoria de Código: Revisa o git diff buscando bugs, Zod e SSRF. |
| `/model` | Trocar Modelo: Menu interativo com busca e favoritos. |
| `/personas` | Seletor de Personas: Alterna o modo de atuação do agente (God, Architect, QA...). |
| `/playground` | Playground Paralelo: Testa um prompt em múltiplos modelos lado a lado. |
| `/vacuum` | Otimizar BD: Desfragmenta e compacta as páginas do SQLite. |
| `/search <termo>` | Busca Web: Pesquisa na web direto pelo terminal sem navegador. |
| `/pack` | Migração: Exporta ou importa o pacote completo de configurações. |
| `/status` | Status API: Verifica se o servidor proxy está respondendo. |
| `/undo` | Restaurar Backup: Reverte o arquivo para o backup `.bak` mais recente. |
| `/save [arquivo]` | Salvar Chat: Exporta a conversa para um arquivo Markdown. |
| `/stats` | Telemetria: Exibe requisições, tokens consumidos e tempo de sessão. |
| `/settings` | Configurações: Ajusta túnel, autenticação, idioma e modo de aprovação. |
| `/help` | Central de Ajuda: Exibe a lista detalhada de comandos. |
| `/clear` | Limpar Chat: Reseta o histórico de mensagens e limpa a tela. |
| `/exit` | Sair: Exige 2x `Ctrl+C` ou comando para encerrar a sessão. |

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
