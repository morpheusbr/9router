<div align="center">
  <img src="./images/9router.png?1" alt="HiperRouter Dashboard" width="800"/>
  
  # HiperRouter
  
  **O Roteador e Assistente de IA Definitivo (Fork Avançado do 9router)**
</div>

---

## 🚀 Sobre o HiperRouter

O **HiperRouter** nasceu como um fork do projeto `9router`, mas evoluiu para se tornar uma poderosa ferramenta autônoma de desenvolvimento. Ele combina a economia de tokens (via RTK) com um **God Mode AI Agent** super inteligente que vive diretamente no seu terminal, atuando como um Engenheiro de Software Sênior assistente.

Nós mantemos a compatibilidade total de proxy para ferramentas como Claude Code, Cursor, Cline e outras, enquanto injetamos superpoderes de autonomia local.

---

## ✨ Nossos Diferenciais (Features Exclusivas do Fork)

- 🧠 **God Mode AI Agent Integrado**: Um agente conversacional em CLI capaz de ler código, entender arquitetura e propor/modificar arquivos autonomamente com alta precisão cirúrgica.
- 👑 **Graphify (Knowledge Graph) Integration**: Mapeamento completo e contínuo da sua codebase. A IA não adivinha: ela consulta o grafo (`graphify-out`) para entender dependências, referências e estrutura antes de alterar qualquer código.
- 🛠️ **Self-Healing Bash**: A IA roda scripts e, se algo falhar (ex: erro de build, lint, pacote não encontrado), ela lê o erro do terminal e tenta se autocorrigir iterativamente, sem você precisar intervir.
- 🛡️ **Zod Validation & SSRF Protection**: Blindagem interna severa. As rotas recebem estrita validação de esquema com o `Zod`, impedindo ataques de Server-Side Request Forgery em campos que lidam com URLs (como proxys e webhooks).
- 🧩 **Auto-Aprovação de Comandos (y/n/s)**: A interface interativa memoriza ações similares. Ao escolher `s` (sempre/similar), o agente passará a aprovar automaticamente comandos idênticos que possam entrar em loop, otimizando o fluxo de trabalho.
- ⚡ **RTK - Rust Token Killer**: Substituto do `bash` puro nas operações internas, poupando até 90% do overhead de tokens quando o modelo inspeciona a rede ou arquivos.
- 📦 **Build Seguro (Zero Downtime)**: Fluxo de compilação protegido por shell script (`build-seguro.sh`) garantindo que as alterações no painel frontend (Next.js) subam sem derrubar o roteador.

---

## 🔧 Estrutura do Projeto

* `cli/` - Ponto de entrada do God Mode AI Agent (`cli.js`) e todo o shell conversacional.
* `src/` - Lógica do roteador, proxying e manipulação pesada de backend.
* `app/` - Aplicação Next.js de Dashboard, compilada via `build-seguro.sh`.
* `.HiperRouter/` - Local do banco de dados (SQLite), contextos isolados e estado das chaves/modelos.

---

## ⚡ Começando Rápidamente (Quick Start)

### 1. Iniciar o CLI
A partir da raiz do projeto, instale as dependências e inicie:
```bash
npm install
node cli/cli.js
# Ou utilize o script '9router' após fazer link local
```

### 2. Conversar com a IA (God Mode)
No menu principal do CLI, selecione **Chat (Interactive)**.
A partir daí, basta pedir que a IA realize tarefas:
> "Como está a arquitetura do nosso CLI?"
> "Encontre e corrija vulnerabilidades nas APIs."
> "Inicie os testes para o módulo de proxy."

A IA fará chamadas dinâmicas às ferramentas e pedirá aprovação (y/n/s) antes de modificar os seus arquivos ou executar comandos sensíveis.

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
