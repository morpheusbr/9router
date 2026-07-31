const { execSync } = require("child_process");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n🧪 HiperRouter Smart Test Executor & Auto-Fixer`);
  console.log(`===============================================\n`);

  console.log(`⏳ Executando suíte de testes automáticos do projeto...`);

  try {
    const output = execSync("npm test", { encoding: "utf8", stdio: "pipe" });
    console.log(output);
    console.log(`\n🎉 Todos os testes passaram com sucesso! Nenhuma correção necessária.`);
  } catch (err) {
    const errorOutput = err.stdout || err.stderr || err.message;
    console.log(`\n❌ Falha detectada na execução dos testes:\n`);
    console.log(errorOutput.substring(0, 1000));
    console.log(`\n💡 Dica: No modo Chat do HiperRouter, o agente capturará a stack trace e aplicará os patches de correção automaticamente!`);
  }

  console.log(`\n===============================================\n`);
  await pause();
  return 0;
}

module.exports = { run };
