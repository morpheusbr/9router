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

  // Step 2: Bind host (local-only vs LAN)
  const hostChoice = await select(
    `${COLORS.bright}Acesso ao servidor:${COLORS.reset}`,
    [
      "Somente este computador (127.0.0.1) — recomendado",
      "Rede local / LAN (0.0.0.0) — outros devices na rede"
    ]
  );
  const defaultHost = hostChoice === 1 ? "0.0.0.0" : "127.0.0.1";
  configStore.set("defaultHost", defaultHost);
  if (defaultHost === "0.0.0.0") {
    console.log(`${COLORS.yellow}⚠ Gateway acessível na LAN. Use senha forte no dashboard.${COLORS.reset}`);
  }

  // Step 3: Auto-open browser
  const autoBrowser = await confirm(`${COLORS.bright}Abrir dashboard automaticamente no browser?${COLORS.reset}`);
  configStore.set("autoBrowser", autoBrowser);

  // Step 4: Locale
  const localeChoice = await select(
    `${COLORS.bright}Idioma das mensagens:${COLORS.reset}`,
    [
      "Português (Brasil)",
      "English"
    ]
  );
  configStore.set("locale", localeChoice === 0 ? "pt-BR" : "en");

  // Step 5: Quick provider setup hint
  console.log(`\n${COLORS.green}✅ Configuração salva!${COLORS.reset}\n`);
  console.log(`${COLORS.dim}Próximos passos:${COLORS.reset}`);
  console.log(`  ${COLORS.cyan}1.${COLORS.reset} O servidor iniciará em ${defaultHost}:${port}`);
  console.log(`  ${COLORS.cyan}2.${COLORS.reset} Acesse o dashboard para adicionar providers`);
  console.log(`  ${COLORS.cyan}3.${COLORS.reset} Use: hiperrouter status | stop | start`);
  console.log(`  ${COLORS.cyan}4.${COLORS.reset} Use /help no chat ou: hiperrouter help\n`);

  configStore.set(ONBOARDING_DONE_KEY, true);
  configStore.set("onboardingDate", new Date().toISOString());

  await prompt(`${COLORS.dim}Pressione Enter para iniciar...${COLORS.reset}`);
}

module.exports = { isFirstRun, runOnboarding };
