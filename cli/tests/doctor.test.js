import { createRequire } from "module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const require = createRequire(import.meta.url);
const {
  checkNodeVersion,
  formatBytes,
  parseArgs,
} = require("../src/cli/commands/doctorChecks");

// ── Pure unit tests ──────────────────────────────────────────────────────────

describe("doctorChecks", () => {
  describe("checkNodeVersion", () => {
    it("passes for node >= 18", () => {
      expect(checkNodeVersion("v18.0.0").ok).toBe(true);
      expect(checkNodeVersion("v19.5.0").ok).toBe(true);
      expect(checkNodeVersion("v20.11.1").ok).toBe(true);
    });

    it("fails for node < 18", () => {
      expect(checkNodeVersion("v16.13.0").ok).toBe(false);
      expect(checkNodeVersion("v17.9.1").ok).toBe(false);
    });

    it("returns correct version string", () => {
      expect(checkNodeVersion("v18.1.0").version).toBe("v18.1.0");
    });

    it("ok message contains version", () => {
      const { message } = checkNodeVersion("v20.0.0");
      expect(message).toContain("v20.0.0");
    });

    it("fail message contains version and min requirement", () => {
      const { message } = checkNodeVersion("v16.0.0");
      expect(message).toContain("v16.0.0");
      expect(message).toMatch(/18/);
    });

    it("respects custom minMajor", () => {
      expect(checkNodeVersion("v20.0.0", 22).ok).toBe(false);
      expect(checkNodeVersion("v22.0.0", 22).ok).toBe(true);
    });
  });

  describe("formatBytes", () => {
    it("formats 0 bytes", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    it("formats bytes", () => {
      expect(formatBytes(100)).toBe("100 B");
      expect(formatBytes(1023)).toBe("1023 B");
    });

    it("formats kilobytes", () => {
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(1500)).toBe("1.5 KB");
    });

    it("KB boundary: 1024*1024-1 is still KB", () => {
      const n = 1024 * 1024 - 1;
      expect(formatBytes(n)).toMatch(/KB$/);
    });

    it("formats megabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
      expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.50 MB");
    });
  });

  describe("parseArgs", () => {
    it("parses --fix / -f", () => {
      expect(parseArgs(["--fix"]).fix).toBe(true);
      expect(parseArgs(["-f"]).fix).toBe(true);
    });

    it("parses --port / -p", () => {
      expect(parseArgs(["--port", "3000"]).port).toBe(3000);
      expect(parseArgs(["-p", "8080"]).port).toBe(8080);
    });

    it("parses --help / -h", () => {
      expect(parseArgs(["--help"]).help).toBe(true);
      expect(parseArgs(["-h"]).help).toBe(true);
    });

    it("returns defaults for no args", () => {
      const { fix, port, help } = parseArgs([]);
      expect(fix).toBe(false);
      expect(port).toBe(null);
      expect(help).toBe(false);
    });

    it("ignores unknown args", () => {
      const { fix, port, help } = parseArgs(["--unknown", "foo"]);
      expect(fix).toBe(false);
      expect(port).toBe(null);
      expect(help).toBe(false);
    });

    it("--port missing value is ignored (remains null)", () => {
      // The i+1 check prevents reading past the end
      const { port } = parseArgs(["--port"]);
      expect(port).toBe(null);
    });

    it("parses combined flags", () => {
      const opts = parseArgs(["-f", "-p", "9000", "-h"]);
      expect(opts.fix).toBe(true);
      expect(opts.port).toBe(9000);
      expect(opts.help).toBe(true);
    });
  });
});

// ── Integration: doctor --help ───────────────────────────────────────────────

describe("doctor --help integration", () => {
  let tmpDir;
  let logs;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "hiperrouter-doctor-test-"));
    process.env.DATA_DIR = tmpDir;
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

    // Bust cache so DATA_DIR is picked up
    for (const key of Object.keys(require.cache)) {
      if (key.includes("cli/src/cli")) delete require.cache[key];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("returns 0 and prints usage for --help", async () => {
    const doctor = require("../src/cli/commands/doctor");
    const code = await doctor.run(["--help"]);
    expect(code).toBe(0);
    const output = logs.join("\n");
    expect(output).toMatch(/--fix/);
    expect(output).toMatch(/--port/);
  });

  it("returns 0 and prints usage for -h", async () => {
    const doctor = require("../src/cli/commands/doctor");
    const code = await doctor.run(["-h"]);
    expect(code).toBe(0);
  });
});
