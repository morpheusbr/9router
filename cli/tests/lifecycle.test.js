import { createRequire } from "module";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const require = createRequire(import.meta.url);

// Each test gets its own temp DATA_DIR so lifecycle ops never touch ~/.HiperRouter
let tmpDir;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "hiperrouter-test-"));
  process.env.DATA_DIR = tmpDir;
  // Bust the configStore cache between tests
  delete require.cache[require.resolve("../src/cli/utils/configStore")];
  delete require.cache[require.resolve("../src/cli/utils/lifecycle")];
  delete require.cache[require.resolve("../src/cli/constants")];
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("lifecycle.js", () => {
  describe("isPidAlive", () => {
    it("returns true for the current process pid", () => {
      const { isPidAlive } = require("../src/cli/utils/lifecycle");
      expect(isPidAlive(process.pid)).toBe(true);
    });

    it("returns false for a non-existent pid", () => {
      const { isPidAlive } = require("../src/cli/utils/lifecycle");
      // PID 1 may or may not be alive; use a clearly invalid large number
      // kill(pid, 0) on pid 999999999 throws ESRCH on all platforms
      expect(isPidAlive(999999999)).toBe(false);
    });

    it("returns false for falsy input", () => {
      const { isPidAlive } = require("../src/cli/utils/lifecycle");
      expect(isPidAlive(null)).toBe(false);
      expect(isPidAlive(0)).toBe(false);
    });
  });

  describe("resolvePort / resolveHost", () => {
    it("returns DEFAULT_PORT when no cli port and no saved pref", () => {
      const { resolvePort } = require("../src/cli/utils/lifecycle");
      const { DEFAULT_PORT } = require("../src/cli/constants");
      expect(resolvePort(null)).toBe(DEFAULT_PORT);
    });

    it("returns cli port when provided", () => {
      const { resolvePort } = require("../src/cli/utils/lifecycle");
      expect(resolvePort(3000)).toBe(3000);
    });

    it("returns DEFAULT_HOST when no cli host and no saved pref", () => {
      const { resolveHost } = require("../src/cli/utils/lifecycle");
      const { DEFAULT_HOST } = require("../src/cli/constants");
      expect(resolveHost(null)).toBe(DEFAULT_HOST);
    });

    it("returns cli host when provided", () => {
      const { resolveHost } = require("../src/cli/utils/lifecycle");
      expect(resolveHost("0.0.0.0")).toBe("0.0.0.0");
    });
  });

  describe("lock: acquireLock / releaseLock / readLockPid / clearStaleLock", () => {
    it("acquireLock writes current pid and readLockPid reads it back", () => {
      const { acquireLock, readLockPid } = require("../src/cli/utils/lifecycle");
      const holder = acquireLock();
      expect(holder).toBe(0); // 0 = success (no competing process)
      expect(readLockPid()).toBe(process.pid);
    });

    it("releaseLock removes the lock file", () => {
      const { acquireLock, releaseLock, readLockPid } = require("../src/cli/utils/lifecycle");
      acquireLock();
      releaseLock();
      expect(readLockPid()).toBe(null);
    });

    it("readLockPid returns null when no lock file exists", () => {
      const { readLockPid } = require("../src/cli/utils/lifecycle");
      expect(readLockPid()).toBe(null);
    });

    it("clearStaleLock removes a lock with a dead pid and returns true", () => {
      const { getLockFilePath, clearStaleLock } = require("../src/cli/utils/lifecycle");
      const { writeFileSync, mkdirSync } = require("fs");
      const { dirname } = require("path");
      // Write a lock with a clearly dead pid
      const lf = getLockFilePath();
      mkdirSync(dirname(lf), { recursive: true });
      writeFileSync(lf, "999999999", "utf8");
      expect(clearStaleLock()).toBe(true);
    });

    it("clearStaleLock returns false when no lock exists", () => {
      const { clearStaleLock } = require("../src/cli/utils/lifecycle");
      expect(clearStaleLock()).toBe(false);
    });
  });
});
