<div align="center">
  <img src="./images/HiperRouter.png?1" alt="HiperRouter Dashboard" width="800"/>
  
  # HiperRouter
  
  **O Roteador e Assistente de IA Definitivo (Fork Avançado do HiperRouter)**
</div>

---

## 🚀 Sobre o HiperRouter

O **HiperRouter** nasceu como um fork do projeto `9router`, mas evoluiu para se tornar uma poderosa ferramenta autônoma de desenvolvimento. Ele combina a economia de tokens (via RTK) com um **God Mode AI Agent** super inteligente que vive diretamente no seu terminal, atuando como um Engenheiro de Software Sênior assistente.

Nós mantemos a compatibilidade total de proxy para ferramentas como Claude Code, Cursor, Cline e outras, enquanto injetamos superpoderes de autonomia local.

---

## ✨ Nossos Diferenciais (Features Exclusivas do Fork)

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
  - **Central de Ajuda Integrada**: Comando `/help` detalhando todos os 24 comandos.
- 👑 **Graphify (Knowledge Graph) Integration**: Mapeamento completo e contínuo da sua codebase (`graphify-out`) com recarregamento reativo no chat.
- 🛠️ **Self-Healing Bash**: Executa scripts, lê erros de terminal e realiza auto-correção iterativa.
- ⚡ **RTK - Rust Token Killer**: Substituto do `bash` puro nas operações internas, poupando até 90% do overhead de tokens.
- 📦 **Build Seguro (Zero Downtime)**: Fluxo de compilação protegido por shell script (`build-seguro.sh`) sem derrubar o roteador em produção.

---

## 📖 Comandos do God Mode CLI (`/help`)

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

## 🔧 Estrutura do Projeto

* `cli/` - Ponto de entrada do God Mode AI Agent (`cli.js`) e todo o shell conversacional.
* `src/` - Lógica do roteador, proxying e manipulação pesada de backend.
* `app/` - Aplicação Next.js de Dashboard, compilada via `build-seguro.sh`.
* `.HiperRouter/` - Local do banco de dados (SQLite), contextos isolados, logs de auditoria (`audit.log`) e estado das chaves.

---

## ⚡ Começando Rápidamente (Quick Start)

### 1. Iniciar o CLI
A partir da raiz do projeto, instale as dependências e inicie:
```bash
npm install
node cli/cli.js
```

### 2. Conversar com a IA (God Mode)
No menu principal do CLI, selecione **Chat (Interactive)**.
Digite `/help` a qualquer momento para ver a lista de comandos ou pressione `Tab` para autocompletar.

---

## 🛡️ Regras e Desenvolvimento

Este repositório segue regras rigorosas ditadas pelo arquivo `AGENTS.md`. Se você é um agente de IA lendo este documento, lembre-se:
1. **Zero `any` Policy** (TypeScript restrito).
2. Não delete código morto sem aprovação ou flag de DEPRECATED.
3. SEMPRE atualize o grafo com `rtk graphify update .` ao fim das mudanças.
4. Utilize `rtk` antes de comandos bash sugeridos ou rodados.

---

## 📄 Licença
Mantemos as raízes originais. MIT License.
