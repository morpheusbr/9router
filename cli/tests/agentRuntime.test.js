import { createRequire } from "module";
import { describe, it, expect, afterEach, vi } from "vitest";

const require = createRequire(import.meta.url);
const { AgentRuntime } = require("../src/cli/agent/agentRuntime");
const { ToolRegistry } = require("../src/cli/agent/toolRegistry");

function responseFor(content) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(new TextEncoder().encode(payload), { status: 200 });
}

afterEach(() => vi.restoreAllMocks());

describe("AgentRuntime", () => {
  it("respeita o limite de iterações e retorna métricas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFor("resposta final")));
    const runtime = new AgentRuntime({
      port: 20128,
      apiKey: "test",
      model: "test-model",
      toolRegistry: new ToolRegistry(),
      confirmFn: async () => false,
    });

    const result = await runtime.run([{ role: "user", content: "oi" }], { maxIterations: 1 });
    expect(result.iterations).toBe(1);
    expect(result.cancelled).toBe(false);
    expect(result.finalMessage).toBe("resposta final");
  });

  it("impede duas execuções simultâneas", async () => {
    const fetchMock = vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const runtime = new AgentRuntime({
      port: 20128,
      apiKey: "test",
      model: "test-model",
      toolRegistry: new ToolRegistry(),
      confirmFn: async () => false,
    });

    const first = runtime.run([{ role: "user", content: "oi" }]);
    await expect(runtime.run([{ role: "user", content: "outra" }])).rejects.toThrow(/execução ativa/);
    runtime.cancel();
    const result = await first;
    expect(result.cancelled).toBe(true);
  });
});
