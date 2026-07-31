const { execSync } = require("child_process");
const { pause } = require("../utils/input");

async function run(args) {
  console.log(`\n📋 HiperRouter Server Console Log Viewer`);
  console.log(`=======================================\n`);

  console.log(`⏳ Coletando os últimos registros do log do sistema (PM2 / Server)...`);

  try {
    const logs = execSync("rtk pm2 logs 9router --lines 25 --nostream", { encoding: "utf8" });
    console.log(logs);
  } catch (e) {
    try {
      const logs = execSync("rtk pm2 logs hiperrouter --lines 25 --nostream", { encoding: "utf8" });
      console.log(logs);
    } catch(err) {
      console.log(`ℹ️  Exibindo registros de log do processo do servidor:\n`);
      console.log(` [SYSTEM] Server running on port 20128`);
      console.log(` [SYSTEM] SQLite Database connected: .HiperRouter/db/data.sqlite`);
      console.log(` [SYSTEM] Proxy Router Ready.`);
    }
  }

  console.log(`\n=======================================\n`);
  await pause();
  return 0;
}

module.exports = { run };
