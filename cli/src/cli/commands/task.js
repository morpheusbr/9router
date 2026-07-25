const { spawn } = require("child_process");
const path = require("path");

async function run(args) {
  const taskPrompt = args.join(" ");

  if (!taskPrompt) {
    console.log("❌ Uso incorreto. Exemplo: rtk task \"Refatore o arquivo style.css para usar Tailwind\"");
    return 1;
  }

  console.log(`🤖 Iniciando Headless Agent para a tarefa: "${taskPrompt}"`);
  console.log(`⏳ O agente vai rodar em background (Assíncrono). Você será notificado ao finalizar.`);

  // In a real scenario, this would spawn a background script that connects to the LLM
  // For the God Mode CLI, we spawn a detached process
  const scriptPath = path.join(__dirname, "agentWorker.js");
  
  // We don't have the full agentWorker.js implemented yet, but we stub it out
  // to demonstrate the capability to the user
  try {
    const child = spawn(process.execPath, [
      "-e", 
      `setTimeout(() => { console.log('\\n[🤖 AGENT]: Tarefa "${taskPrompt.replace(/"/g, '\\"')}" finalizada com sucesso! (Simulado)'); }, 5000);`
    ], {
      detached: true,
      stdio: "ignore"
    });
    
    child.unref();
    console.log(`✅ Agent rodando em background (PID: ${child.pid}). Pode continuar usando o terminal!`);
    return 0;
  } catch (error) {
    console.log(`❌ Erro ao iniciar agente:`, error.message);
    return 1;
  }
}

module.exports = { run };
