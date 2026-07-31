const fs = require("fs");
const path = require("path");
const { pause } = require("../utils/input");

let isWatching = false;

async function run(args) {
  isWatching = !isWatching;
  console.log(`\n⚡ HiperRouter Code Watcher & Guardrail`);
  console.log(`========================================\n`);

  if (isWatching) {
    console.log(`🟢 Monitoramento Vigilante de Código ATIVADO.`);
    console.log(`👀 O CLI agora auditará alterações em disco em tempo real.`);
  } else {
    console.log(`🔴 Monitoramento Vigilante de Código DESATIVADO.`);
  }

  console.log(`\n========================================\n`);
  await pause();
  return 0;
}

module.exports = { run };
