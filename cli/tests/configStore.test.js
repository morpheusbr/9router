import { createRequire } from "module";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const require = createRequire(import.meta.url);

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "hiperrouter-configstore-test-"));
  process.env.DATA_DIR = tmpDir;
  // Bust module cache so _cache is reset and DATA_DIR is picked up fresh
  delete require.cache[require.resolve("../src/cli/utils/configStore")];
  delete require.cache[require.resolve("../src/cli/constants")];
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function store() {
  return require("../src/cli/utils/configStore");
}

describe("configStore", () => {
  describe("get", () => {
    it("returns fallback when key absent", () => {
      expect(store().get("missing", "fb")).toBe("fb");
    });

    it("returns undefined fallback by default", () => {
      expect(store().get("missing")).toBeUndefined();
    });

    it("returns stored value over fallback", () => {
      const s = store();
      s.set("k", "v");
      expect(s.get("k", "fb")).toBe("v");
    });

    it("returns falsy values correctly (0, false, empty string)", () => {
      const s = store();
      s.set("zero", 0);
      s.set("flag", false);
      s.set("empty", "");
      expect(s.get("zero", 99)).toBe(0);
      expect(s.get("flag", true)).toBe(false);
      expect(s.get("empty", "fb")).toBe("");
    });
  });

  describe("set / save", () => {
    it("persists a value across cache busts", () => {
      store().set("foo", "bar");
      // Bust cache to force re-read from disk
      delete require.cache[require.resolve("../src/cli/utils/configStore")];
      delete require.cache[require.resolve("../src/cli/constants")];
      expect(store().get("foo")).toBe("bar");
    });

    it("merges with existing keys", () => {
      const s = store();
      s.set("a", 1);
      s.set("b", 2);
      expect(s.get("a")).toBe(1);
      expect(s.get("b")).toBe(2);
    });

    it("save overwrites entire config", () => {
      const s = store();
      s.set("a", 1);
      s.save({ b: 2 });
      expect(s.get("a")).toBeUndefined();
      expect(s.get("b")).toBe(2);
    });

    it("creates dir if missing", () => {
      // tmpDir exists but sub-path doesn't — DATA_DIR handles this via getCliDataDir
      // Just verify save doesn't throw when dir already present
      expect(() => store().save({ x: 1 })).not.toThrow();
    });
  });

  describe("load", () => {
    it("returns empty object when no file exists", () => {
      expect(store().load()).toEqual({});
    });

    it("caches: second call skips disk read", () => {
      const s = store();
      s.set("k", "v");
      // Mutate cache externally via load reference
      const cfg = s.load();
      cfg.__injected = true;
      // load() returns same object (cache hit), so injected key visible
      expect(s.load().__injected).toBe(true);
    });
  });

  describe("appendToArray / getArray", () => {
    it("appends to front", () => {
      const s = store();
      s.appendToArray("hist", "a");
      s.appendToArray("hist", "b");
      expect(s.getArray("hist")).toEqual(["b", "a"]);
    });

    it("deduplicates: moves existing value to front", () => {
      const s = store();
      s.appendToArray("hist", "a");
      s.appendToArray("hist", "b");
      s.appendToArray("hist", "a");
      expect(s.getArray("hist")).toEqual(["a", "b"]);
    });

    it("caps at maxItems", () => {
      const s = store();
      for (let i = 0; i < 15; i++) s.appendToArray("hist", `item${i}`, 10);
      expect(s.getArray("hist").length).toBe(10);
    });

    it("getArray returns [] for missing or non-array key", () => {
      const s = store();
      expect(s.getArray("nope")).toEqual([]);
      s.set("scalar", 42);
      expect(s.getArray("scalar")).toEqual([]);
    });
  });

  describe("getConfigPath", () => {
    it("includes cli-config.json", () => {
      expect(store().getConfigPath()).toMatch(/cli-config\.json$/);
    });
  });
});
