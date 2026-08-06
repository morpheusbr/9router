import { createRequire } from "module";
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const require = createRequire(import.meta.url);
const { resolveWorkspacePath } = require("../src/cli/agent/workspaceGuard");

describe("workspaceGuard", () => {
  it("permite arquivos dentro do workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "hiperrouter-guard-"));
    writeFileSync(join(root, "file.txt"), "ok");
    expect(resolveWorkspacePath(root, "file.txt")).toBe(join(root, "file.txt"));
    rmSync(root, { recursive: true, force: true });
  });

  it("bloqueia caminhos absolutos fora do workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "hiperrouter-guard-"));
    expect(() => resolveWorkspacePath(root, "/etc/passwd")).toThrow(/fora do diretório/);
    rmSync(root, { recursive: true, force: true });
  });

  it("bloqueia traversal em arquivo novo", () => {
    const root = mkdtempSync(join(tmpdir(), "hiperrouter-guard-"));
    mkdirSync(join(root, "nested"));
    expect(() => resolveWorkspacePath(root, "nested/../../escape.txt", { allowMissing: true })).toThrow(/fora do diretório/);
    rmSync(root, { recursive: true, force: true });
  });
});
