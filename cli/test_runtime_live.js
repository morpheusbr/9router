const { AgentRuntime } = require("./src/cli/agent/agentRuntime");
const api = require("./src/cli/api/client");
const { createDefaultRegistry } = require("./src/cli/agent/toolRegistry");
const { COLORS } = require("./src/cli/utils/input");

async function test() {
  const keysResult = await api.getApiKeys();
  const apiKey = keysResult.success ? keysResult.data.keys[0].key : "no-key";
  
  const runtime = new AgentRuntime({
    port: 20128,
    apiKey,
    model: "meu-combo",
    toolRegistry: createDefaultRegistry(),
    confirmFn: async () => true
  });

  let runtimeSpinner = null;
  runtime.on("stream_start", () => {
    runtimeSpinner = setInterval(() => {
      process.stdout.write(`\rIA: ⠋ Pensando...`);
    }, 80);
  });

  runtime.on("chunk", (text) => {
    if (runtimeSpinner) {
      clearInterval(runtimeSpinner);
      runtimeSpinner = null;
      process.stdout.write(`\rIA: \x1b[K`);
    }
    process.stdout.write(text);
  });
  
  runtime.on("tool_call_start", () => process.stdout.write("\n[TOOL START]\n"));
  runtime.on("tool_call_end", () => process.stdout.write("\n[TOOL END]\n"));

  await runtime.run([{ role: "user", content: "oi" }], { currentCommand: "" });
}
test().catch(console.error);
