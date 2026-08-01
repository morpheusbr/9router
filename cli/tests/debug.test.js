import { createRequire } from "module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const require = createRequire(import.meta.url);

let tmpDir;
let logs;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "hiperrouter-debug-test-"));
  process.env.DATA_DIR = tmpDir;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...args) => logs.push(args.join(" ")));

  // Bust cache
  for (const key of Object.keys(require.cache)) {
    if (key.includes("cli/src/cli")) delete require.cache[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function debug() {
  return require("../src/cli/commands/debug");
}

describe("debug paths", () => {
  it("returns 0", async () => {
    expect(await debug().run(["paths"])).toBe(0);
  });

  it("prints DATA_DIR", async () => {
    await debug().run(["paths"]);
    expect(logs.join("\n")).toContain(tmpDir);
  });

  it("prints platform and node version", async () => {
    await debug().run(["paths"]);
    const out = logs.join("\n");
    expect(out).toContain(process.platform);
    expect(out).toContain(process.version);
  });

  it("prints cli-config path inside DATA_DIR", async () => {
    await debug().run(["paths"]);
    expect(logs.join("\n")).toContain("cli-config.json");
  });
});

describe("debug config", () => {
  it("returns 0 when config file absent", async () => {
    expect(await debug().run(["config"])).toBe(0);
  });

  it("says file does not exist when absent", async () => {
    await debug().run(["config"]);
    expect(logs.join("\n")).toMatch(/não existe|vazio/i);
  });

  it("returns 0 and prints JSON when config exists", async () => {
    const cfg = { defaultPort: 20128, locale: "pt-BR" };
    writeFileSync(join(tmpDir, "cli-config.json"), JSON.stringify(cfg, null, 2));

    const code = await debug().run(["config"]);
    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).toContain("20128");
    expect(out).toContain("pt-BR");
  });

  it("returns 1 on malformed JSON", async () => {
    writeFileSync(join(tmpDir, "cli-config.json"), "{ invalid json }");
    const code = await debug().run(["config"]);
    expect(code).toBe(1);
    expect(logs.join("\n")).toMatch(/erro/i);
  });
});

describe("debug --help / no args", () => {
  it("returns 0 for --help", async () => {
    expect(await debug().run(["--help"])).toBe(0);
  });

  it("returns 0 for -h", async () => {
    expect(await debug().run(["-h"])).toBe(0);
  });

  it("returns 0 for no args", async () => {
    expect(await debug().run([])).toBe(0);
  });

  it("help output lists subcommands", async () => {
    await debug().run(["--help"]);
    const out = logs.join("\n");
    expect(out).toContain("paths");
    expect(out).toContain("config");
  });
});

describe("debug unknown subcommand", () => {
  it("returns 1", async () => {
    expect(await debug().run(["unknown"])).toBe(1);
  });

  it("prints error with available subcommands", async () => {
    await debug().run(["nope"]);
    expect(logs.join("\n")).toMatch(/paths.*config|config.*paths/);
  });
});
