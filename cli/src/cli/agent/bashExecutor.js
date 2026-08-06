/**
 * bashExecutor.js — Motor de execução de comandos bash para o Agent Runtime.
 *
 * Extraído do `runBashCommand` original em chatUI.js.
 * Contém todos os guardrails de segurança:
 * - Infinite Loop Guard
 * - Anti-Bash Destruct Guardrail
 * - rtk prefix injection
 * - Git checkpoint / auto-verification / rollback
 * - Progress spinner
 */

const { spawn } = require("child_process");
const fs = require("fs");
const { sanitizePromptContext } = require("./sanitize");
const { logAudit, createGitCheckpoint, rollbackGitCheckpoint } = require("../chat/patchEngine");
const { COLORS } = require("../utils/input");

// --- Infinite Loop Guard ---
const commandExecutionHistory = [];

/**
 * Verifica se um comando está em loop infinito (3x consecutivas).
 * @param {string} cmd
 * @returns {boolean}
 */
function checkInfiniteLoopGuard(cmd) {
  const norm = cmd.trim().toLowerCase();
  commandExecutionHistory.push(norm);
  if (commandExecutionHistory.length > 50) commandExecutionHistory.shift();
  const repeatCount = commandExecutionHistory.slice(-4).filter(c => c === norm).length;
  return repeatCount >= 3;
}

/**
 * Injeta prefixo `rtk` em comandos conhecidos, respeitando heredocs.
 * @param {string} rawCmd - Comando original
 * @returns {string} Comando com rtk prefixado onde aplicável
 */
function injectRtkPrefix(rawCmd) {
  let inHereDoc = false;
  let hereDocMarker = "";

  return rawCmd.split('\n').map(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return line;

    // Fim do heredoc
    if (inHereDoc && t === hereDocMarker) {
      inHereDoc = false;
      return line;
    }
    // Dentro de heredoc
    if (inHereDoc) return line;

    // Início de heredoc
    const hereDocMatch = t.match(/<<\s*-?\s*['"]?([a-zA-Z0-9_-]+)['"]?/);
    if (hereDocMatch) {
      inHereDoc = true;
      hereDocMarker = hereDocMatch[1];
    }

    // Lista segura de comandos comuns
    const knownCommands = /^(npm|npx|node|git|grep|cat|ls|rm|cd|pwd|cp|mv|sed|awk|curl|wget|docker|pm2|graphify|yarn|pnpm|bun|echo|mkdir|touch|chmod|chown|sudo|apt|apt-get|find|tar|unzip|zip)\b/;

    if (!t.startsWith('rtk ') && knownCommands.test(t)) {
      return line.replace(/^(\s*)/, '$1rtk ');
    }

    return line;
  }).join('\n');
}

/**
 * Executa um comando bash com todos os guardrails de segurança.
 *
 * @param {string} rawCmd - Comando original (sem rtk prefix)
 * @param {object} opts
 * @param {string}  opts.confirmLabel       - Texto do prompt de confirmação
 * @param {string}  opts.confirmFeedbackMsg - Mensagem quando usuário envia feedback
 * @param {Array}   opts.messages           - Array de mensagens da conversa
 * @param {string}  opts.aiFullMessage      - Resposta completa da IA
 * @param {boolean} opts.pushAssistantFirst - Push assistant ANTES de executar
 * @param {boolean} opts.feedbackToAI       - Envia resultado de volta para a IA
 * @param {boolean} opts.selfHealing        - Auto-cura: envia erro para a IA corrigir
 * @param {Function} opts.confirmFn         - Função de confirmação (confirmWithAuto)
 * @returns {Promise<{aiThinking: boolean, shouldBreak: boolean}>}
 */
async function runBashCommand(rawCmd, opts = {}) {
  const {
    confirmLabel = 'Executar o comando?',
    confirmFeedbackMsg = 'O usuário rejeitou o comando e disse',
    messages,
    aiFullMessage = '',
    pushAssistantFirst = false,
    feedbackToAI = false,
    selfHealing = false,
    confirmFn,
    ctxLimit = 32768,
    signal,
    timeoutMs = 120000,
    maxOutputChars = 512000,
  } = opts;

  if (!messages) {
    throw new Error("[bashExecutor] messages é obrigatório");
  }
  if (!confirmFn) {
    throw new Error("[bashExecutor] confirmFn é obrigatório");
  }

  // --- Infinite Loop Guard ---
  if (checkInfiniteLoopGuard(rawCmd)) {
    console.log(`\n${COLORS.red}🛑 [Infinite Loop Guard]: O comando '${rawCmd}' foi tentado 3x seguidas. Pausando auto-healing para segurança.${COLORS.reset}\n`);
    logAudit("LOOP_GUARD_TRIGGERED", { command: rawCmd });
    messages.push({ role: 'system', content: `[Infinite Loop Guard Interrompido]: O comando '${rawCmd}' falhou 3 vezes consecutivas. Peça ajuda ao usuário.` });
    return { aiThinking: false, shouldBreak: true };
  }

  // --- Anti-Bash Destruct Guardrail ---
  const destRegex = /(sed\s+-i|awk\s|cat\s+<<|cat\s+.*?>|echo\s+.*?>|tee\s|rm\s+.*?\.)/i;
  const extRegex = /\.(ts|tsx|js|jsx|json|css|md|html)\b/i;

  if (destRegex.test(rawCmd) && extRegex.test(rawCmd) && !rawCmd.includes("scripts/")) {
    console.log(`\n${COLORS.red}🛑 [Anti-Bash Destruct]: Comando shell destrutivo bloqueado pelo Guardrail.${COLORS.reset}`);
    logAudit("BASH_DESTRUCT_BLOCKED", { command: rawCmd });
    messages.push({
      role: 'system',
      content: `[ACESSO BASH NEGADO]: Operação bloqueada pelo guardrail Anti-Destruição.\nVocê tentou usar shell scripting (sed, awk, redirecionamentos > ou rm) em arquivos de código fonte. O Bash é altamente destrutivo para arquivos TS/JS, pois frequentemente destrói aspas, indentação ou variáveis.\n\nREGRAS:\n1. Para editar código existente: USE EXCLUSIVAMENTE A TAG <patch path="..."></patch>.\n2. Para criar arquivos novos ou testar lógicas complexas: Crie um script Node.js na pasta temporária 'scripts/'.\n\nAbandone o Bash para esta tarefa, reavalie sua abordagem e tente novamente usando as ferramentas corretas.`
    });
    return { aiThinking: true, shouldBreak: true };
  }

  createGitCheckpoint();
  logAudit("COMMAND_EXECUTE", { command: rawCmd, approved: true });

  const shouldRun = await confirmFn(
    `\n${COLORS.yellow}${confirmLabel}\n${COLORS.dim}${rawCmd}${COLORS.reset}`,
    rawCmd
  );

  if (typeof shouldRun === 'string') {
    messages.push({ role: 'assistant', content: aiFullMessage });
    messages.push({ role: 'user', content: `(${confirmFeedbackMsg}: "${shouldRun}")` });
    return { aiThinking: true, shouldBreak: true };
  }
  if (!shouldRun) return { aiThinking: false, shouldBreak: false };

  // --- rtk prefix injection ---
  const finalCmd = injectRtkPrefix(rawCmd);

  console.log(`\n${COLORS.green}Executando: \n${finalCmd}${COLORS.reset}`);
  if (pushAssistantFirst) messages.push({ role: 'assistant', content: aiFullMessage });

  try {
      const output = await new Promise((resolve, reject) => {
        const child = spawn(finalCmd, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
        let out = "";
        let truncated = false;
        let settled = false;
        let timeout = null;

        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          if (signal) signal.removeEventListener("abort", onAbort);
          fn(value);
        };
        const onAbort = () => {
          child.kill("SIGTERM");
          finish(reject, new DOMException("Aborted", "AbortError"));
        };
        const appendOutput = data => {
          if (out.length >= maxOutputChars) {
            truncated = true;
            return;
          }
          const text = data.toString();
          const available = maxOutputChars - out.length;
          out += text.substring(0, available);
          if (text.length > available) truncated = true;
        };

      // Progress indicator
      let timer = null;
      let ticks = 0;
      const progressChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
       timer = process.stdout.isTTY ? setInterval(() => {
         process.stdout.write(`\r\x1b[36mRodando comando... ${progressChars[ticks++ % progressChars.length]}\x1b[0m`);
       }, 100) : null;

      if (child.stdout) {
         child.stdout.on('data', appendOutput);
      }
      if (child.stderr) {
         child.stderr.on('data', appendOutput);
      }

      child.on('close', code => {
        clearInterval(timer);
        process.stdout.write(`\r\x1b[K`);
         const rendered = truncated ? `${out}\n[output truncated at ${maxOutputChars} chars]` : out;
         if (code === 0) finish(resolve, rendered);
         else finish(reject, new Error(rendered || `Process exited with code ${code}`));
      });
      child.on('error', err => {
        clearInterval(timer);
        process.stdout.write(`\r\x1b[K`);
         finish(reject, err);
       });
       timeout = setTimeout(() => {
         child.kill("SIGTERM");
         finish(reject, new Error(`Process timeout after ${timeoutMs}ms`));
       }, timeoutMs);
       if (signal) {
         if (signal.aborted) onAbort();
         else signal.addEventListener("abort", onAbort, { once: true });
       }
      });

    // --- Output Display (truncado para o terminal) ---
    const outputLines = output.split('\n');
    if (outputLines.length > 15) {
      console.log(outputLines.slice(0, 10).join('\n'));
      console.log(`\n${COLORS.dim}... [ + ${outputLines.length - 10} linhas ocultadas da tela. A IA leu tudo na íntegra. ] ...${COLORS.reset}`);
    } else {
      console.log(output);
    }

    // --- Auto-Verification & Rollback (God Mode Guardrail) ---
    if (selfHealing || feedbackToAI) {
      try {
        const { execSync } = require("child_process");
        const gitStatus = execSync("git status --porcelain", { encoding: "utf8" });
        if (gitStatus.includes(".ts") || gitStatus.includes(".tsx")) {
          console.log(`\n${COLORS.cyan}🔍 [Auto-Guardrail] Alterações em TypeScript detectadas. Validando integridade...${COLORS.reset}`);
          try {
            let tsconfigs = [];
            try {
              const findRes = execSync("find . -maxdepth 2 -name 'tsconfig*.json' -not -path '*/node_modules/*'", { encoding: "utf8" });
              tsconfigs = findRes.trim().split('\\n').filter(Boolean);
            } catch (e) { /* ignore */ }

            if (tsconfigs.length === 0 && fs.existsSync('tsconfig.json')) tsconfigs.push('tsconfig.json');

            for (const tsc of tsconfigs) {
              execSync(`npx tsc --noEmit --project ${tsc}`, { encoding: "utf8", stdio: 'pipe' });
            }
            console.log(`${COLORS.green}✅ [Auto-Guardrail] O código gerado pela IA está limpo e sem erros TypeScript!${COLORS.reset}`);
          } catch (tscErr) {
            const errStr = tscErr.stdout ? tscErr.stdout.toString() : tscErr.toString();
            console.log(`${COLORS.red}❌ [Auto-Guardrail] A IA gerou código com erro de TypeScript! Revertendo a ação...${COLORS.reset}`);

            rollbackGitCheckpoint();

            const errorContext = errStr.substring(0, 2000);
            messages.push({
              role: 'system',
              content: `⚠️ ALERTA DE SEGURANÇA: Seu último comando introduziu erros de tipagem/sintaxe. O guardrail REVERTEU a sua edição automaticamente.\n\nERRO DO COMPILADOR:\n\`\`\`\n${errorContext}\n\`\`\`\n\nPor favor, conserte a sua lógica (verifique imports faltando, uso de 'any', ou identação) e aplique a correção novamente. Lembre-se da política Zero ANY.`
            });
            return { aiThinking: true, shouldBreak: true };
          }
        }
      } catch (e) {
        // Ignora caso não seja repositório git
      }
    }

    if (feedbackToAI) {
      const maxOutputChars = Math.max(2000, Math.floor(ctxLimit * 0.1) * 4); // 10% do contexto em chars
      const sanitizedOut = sanitizePromptContext(output.substring(0, maxOutputChars));
      messages.push({ role: 'system', content: `Resultado:\n\`\`\`\n${sanitizedOut}\n\`\`\`\nContinue.` });
      return { aiThinking: true, shouldBreak: true };
    }
    console.log(`${COLORS.green}✅ Comando concluído.${COLORS.reset}\n`);
    return { aiThinking: false, shouldBreak: false };
  } catch (err) {
    const errorLog = sanitizePromptContext((err.message || err).toString());
    console.log(`${COLORS.red}Erro na execução:\n${errorLog}${COLORS.reset}\n`);
    if (selfHealing) {
      console.log(`${COLORS.dim}🧟‍♂️ [IA Self-Healing: Analisando o erro e gerando correção...]${COLORS.reset}`);
      messages.push({
        role: 'system',
        content: `O comando '${finalCmd}' falhou com este erro:\n\`\`\`\n${errorLog}\n\`\`\`\nAnalise o erro, corrija o que for necessário (criando um patch de código ou sugerindo um comando diferente) e tente resolver autonomamente.`
      });
    } else {
      messages.push({ role: 'system', content: `Erro:\n\`\`\`\n${errorLog}\n\`\`\`\nCorrija se necessário.` });
    }
    return { aiThinking: true, shouldBreak: true };
  }
}

module.exports = { runBashCommand, checkInfiniteLoopGuard, injectRtkPrefix };
