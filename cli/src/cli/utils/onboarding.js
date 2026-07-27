/**
 * First-run onboarding wizard.
 * Detects first launch, shows setup steps, saves preferences.
 */
const fs = require("fs");
const path = require("path");
const { prompt, confirm, select, COLORS } = require("./input");
const configStore = require("./configStore");

const ONBOARDING_DONE_KEY = "onboardingCompleted";

function isFirstRun() {
  return !configStore.get(ONBOARDING_DONE_KEY, false);
}

async function runOnboarding(APP_NAME, DEFAULT_PORT) {
  console.log(`\n${COLORS.cyan}${"═".repeat(50)}${COLORS.reset}`);
  console.log(`  ${COLORS.bright}🚀 Bem-vindo ao ${APP_NAME}!${COLORS.reset}`);
  console.log(`  ${COLORS.dim}Vamos configurar seu ambiente.${COLORS.reset}`);
  console.log(`${COLORS.cyan}${"═".repeat(50)}${COLORS.reset}\n`);

  // Step 1: Port
  const portChoice = await select(
    `${COLORS.bright}Porta do servidor:${COLORS.reset}`,
    [
      `Padrão (${DEFAULT_PORT}) — recomendado`,
      "Personalizar porta"
    ]
  );

  let port = DEFAULT_PORT;
  if (portChoice === 1) {
    const customPort = await prompt(`Porta (1024-65535): `);
    const parsed = parseInt(customPort, 10);
    if (!isNaN(parsed) && parsed >= 1024 && parsed <= 65535) {
      port = parsed;
    } else {
      console.log(`${COLORS.yellow}Porta inválida, usando padrão ${DEFAULT_PORT}${COLORS.reset}`);
    }
  }
  configStore.set("defaultPort", port);

  // Step 2: Auto-open browser
  const autoBrowser = await confirm(`${COLORS.bright}Abrir dashboard automaticamente no browser?${COLORS.reset}`);
  configStore.set("autoBrowser", autoBrowser);

  // Step 3: Locale
  const localeChoice = await select(
    `${COLORS.bright}Idioma das mensagens:${COLORS.reset}`,
    [
      "Português (Brasil)",
      "English"
    ]
  );
  configStore.set("locale", localeChoice === 0 ? "pt-BR" : "en");

  // Step 4: Quick provider setup hint
  console.log(`\n${COLORS.green}✅ Configuração salva!${COLORS.reset}\n`);
  console.log(`${COLORS.dim}Próximos passos:${COLORS.reset}`);
  console.log(`  ${COLORS.cyan}1.${COLORS.reset} O servidor iniciará na porta ${port}`);
  console.log(`  ${COLORS.cyan}2.${COLORS.reset} Acesse o dashboard para adicionar providers`);
  console.log(`  ${COLORS.cyan}3.${COLORS.reset} Use /help no chat para ver todos os comandos`);
  console.log(`  ${COLORS.cyan}4.${COLORS.reset} Use TAB para autocompletar comandos\n`);

  configStore.set(ONBOARDING_DONE_KEY, true);
  configStore.set("onboardingDate", new Date().toISOString());

  await prompt(`${COLORS.dim}Pressione Enter para iniciar...${COLORS.reset}`);
}

module.exports = { isFirstRun, runOnboarding };
