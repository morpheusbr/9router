# 🚀 Progresso do Projeto: HiperRouter

## 📌 Visão Geral
Este documento rastreia todas as implementações, correções e melhorias de arquitetura realizadas no projeto. 
- **Ambiente Unificado (Produção + Desenvolvimento):** `/home/www/HiperRouter`
- **Ambiente Paralelo de Compilação (Zero Downtime):** `/home/www/HiperRouter-build`

---

## ✅ Concluído (Sessão de Hoje)

### 1. Reestruturação do Fluxo de Desenvolvimento e Produção Unificados
- O antigo diretório `/home/www/HiperRouter` foi excluído.
- Migramos toda a produção e desenvolvimento para uma pasta unificada: `/home/www/HiperRouter`.
- O processo do PM2 foi renomeado de `9router` para `HiperRouter`, rodando nativamente a partir desta pasta.
- O banco de dados (`.HiperRouter`) foi preservado e migrado para a raiz da nova estrutura.
- O novo script `build-seguro.sh` clona a pasta para `-build`, faz a compilação paralela completa, e ejeta os binários de volta para dentro do pacote final mantendo a regra de **Zero Downtime**.

### 2. Correções Críticas de Build e Banco de Dados
- **Problema:** A compilação falhava por falta de dependências C++ (`better-sqlite3`).
- **Solução:** Inserida injeção mockada do módulo durante o build e correção no script de empacotamento (`build-cli.js`) para garantir que os binários puros de fallback (`sql.js` e `sql-wasm.wasm`) fossem empacotados corretamente pelo Webpack.
- O sistema conecta com sucesso ao banco de dados em produção usando o driver `sql.js`.

### 3. Melhorias de Segurança (Auditoria)
- Implementada geração dinâmica e armazenamento local (file-based) da chave secreta da API (`API_KEY_SECRET`), removendo as credenciais fixas (hardcoded) do código-fonte e do PM2 (`ecosystem.config.js`).

### 4. Rebranding Visual e Ajustes de UI
- **Rebranding:** O nome da marca foi alterado de `HiperRouter` para `HiperRouter` nas telas principais (Login e Título da página).
- **Tela de Login:** Adicionado um título com gradiente elegante (Orange to Primary), fundo escurecido modernizado, efeitos de escala (*hover*), e melhor hierarquia visual para dicas de segurança.
- A dica com a senha padrão (`123456`) foi removida para tornar a tela de acesso mais limpa e profissional.

---

## ⏳ Pendente / Próximos Passos (Para Amanhã)

- [ ] **Tradução e Localização:** 
  - Mudar a linguagem padrão do sistema para Português (pt-BR).
  - Validar a renderização dos textos via NGINX e garantir que os mapeamentos do `pt.json` no `/i18n` estão sendo servidos adequadamente.
- [ ] **Configuração e Integração do Tailscale:**
  - Garantir que o túnel via Tailscale está implementado de maneira correta no novo fluxo unificado.
- [ ] **Otimizações Futuras:** (A definir com o usuário).

---

*Última atualização: Julho de 2026*
