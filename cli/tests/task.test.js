import { createRequire } from "module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const require = createRequire(import.meta.url);

let tmpDir;
let logs;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "hiperrouter-task-test-"));
  process.env.DATA_DIR = tmpDir;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => logs.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a) => logs.push(a.join(" ")));
  vi.spyOn(process.stderr, "write").mockImplementation(() => {});

  for (const key of Object.keys(require.cache)) {
    if (key.includes("cli/src/cli")) delete require.cache[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function setConfig(obj) {
  writeFileSync(join(tmpDir, "cli-config.json"), JSON.stringify(obj));
}

// ─── --help / sem prompt ──────────────────────────────────────────────────────

describe("task --help", () => {
  it("returns 0 for --help", async () => {
    const { run } = require("../src/cli/commands/task");
    expect(await run(["--help"])).toBe(0);
  });

  it("returns 0 for -h", async () => {
    const { run } = require("../src/cli/commands/task");
    expect(await run(["-h"])).toBe(0);
  });

  it("prints flags in help", async () => {
    const { run } = require("../src/cli/commands/task");
    await run(["--help"]);
    const out = logs.join("\n");
    expect(out).toContain("--model");
    expect(out).toContain("--port");
    expect(out).toContain("--cwd");
  });
});

describe("task sem prompt", () => {
  it("returns 1 sem args", async () => {
    const { run } = require("../src/cli/commands/task");
    expect(await run([])).toBe(1);
  });

  it("returns 1 com apenas flags sem prompt", async () => {
    const { run } = require("../src/cli/commands/task");
    expect(await run(["--model", "gc/gemini-2.5-pro"])).toBe(1);
  });
});

// ─── resolveLocalApiKey ───────────────────────────────────────────────────────

describe("resolveLocalApiKey", () => {
  it("retorna key do cache sem chamar o gateway", async () => {
    setConfig({ localApiKey: "sk-cached-key", defaultPort: 20128 });

    // Monkey-patch getApiKeys pra garantir que não é chamado
    const client = require("../src/cli/api/client");
    const spy = vi.spyOn(client, "getApiKeys");

    const { resolveLocalApiKey } = require("../src/cli/commands/task");
    const key = await resolveLocalApiKey();

    expect(key).toBe("sk-cached-key");
    expect(spy).not.toHaveBeenCalled();
  });

  it("busca key ativa quando cache vazio", async () => {
    setConfig({ defaultPort: 20128 });

    const client = require("../src/cli/api/client");
    vi.spyOn(client, "getApiKeys").mockResolvedValue({
      success: true,
      data: { keys: [{ key: "sk-from-gateway", isActive: true }] },
    });

    const { resolveLocalApiKey } = require("../src/cli/commands/task");
    const key = await resolveLocalApiKey();
    expect(key).toBe("sk-from-gateway");

    // Salva no cache
    delete require.cache[require.resolve("../src/cli/utils/configStore")];
    delete require.cache[require.resolve("../src/cli/constants")];
    const s = require("../src/cli/utils/configStore");
    expect(s.get("localApiKey")).toBe("sk-from-gateway");
  });

  it("cria nova key se nenhuma ativa encontrada", async () => {
    setConfig({ defaultPort: 20128 });

    const client = require("../src/cli/api/client");
    vi.spyOn(client, "getApiKeys").mockResolvedValue({ success: true, data: { keys: [] } });
    vi.spyOn(client, "createApiKey").mockResolvedValue({
      success: true,
      data: { key: "sk-new-key", name: "HiperRouter CLI" },
    });

    const { resolveLocalApiKey } = require("../src/cli/commands/task");
    const key = await resolveLocalApiKey();
    expect(key).toBe("sk-new-key");
    expect(client.createApiKey).toHaveBeenCalledWith("HiperRouter CLI");
  });

  it("retorna null se gateway offline", async () => {
    setConfig({ defaultPort: 20128 });

    const client = require("../src/cli/api/client");
    vi.spyOn(client, "getApiKeys").mockResolvedValue({ success: false, error: "ECONNREFUSED" });
    vi.spyOn(client, "createApiKey").mockResolvedValue({ success: false, error: "ECONNREFUSED" });

    const { resolveLocalApiKey } = require("../src/cli/commands/task");
    const key = await resolveLocalApiKey();
    expect(key).toBeNull();
  });
});

// ─── run() sem key → retorna 1 ───────────────────────────────────────────────

describe("task run sem API key", () => {
  it("returns 1 e imprime erro quando resolveLocalApiKey retorna null", async () => {
    setConfig({ defaultPort: 20128 });

    const client = require("../src/cli/api/client");
    vi.spyOn(client, "getApiKeys").mockResolvedValue({ success: false, error: "ECONNREFUSED" });
    vi.spyOn(client, "createApiKey").mockResolvedValue({ success: false, error: "ECONNREFUSED" });

    const { run } = require("../src/cli/commands/task");
    const code = await run(["explique este repo"]);
    expect(code).toBe(1);
    expect(logs.join("\n")).toMatch(/api key|gateway/i);
  });
});
