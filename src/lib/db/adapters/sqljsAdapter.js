import fs from "node:fs";
import path from "path";
import { DATA_DIR } from "@/lib/dataDir.js";
import { PRAGMA_SQL } from "../schema.js";

async function loadSqlJs() {
  // sql.js exports only a default function — handle both ESM default and CJS module.exports
  const mod = await import("sql.js");
  const initSqlJs = mod.default ?? mod;
  if (typeof initSqlJs !== "function") throw new Error(`sql.js default export is not a function (got ${typeof initSqlJs})`);
  return initSqlJs();
}

export async function createSqlJsAdapter(filePath) {
  const SQLLib = await loadSqlJs();
  const buf = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  const db = new SQLLib.Database(buf);
  db.exec(PRAGMA_SQL);

  let dirty = false;
  let saveTimer = null;
  const SAVE_DEBOUNCE_MS = 50; // Reduced from 100ms for faster persistence

  function persist() {
    try {
      const data = db.export();
      // Use async write with error handling
      fs.promises.writeFile(filePath, Buffer.from(data))
        .catch(e => console.error("[sqljs] save failed:", e));
    } catch (e) {
      console.error("[sqljs] save failed:", e);
    }
    dirty = false;
  }

  function scheduleSave() {
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (dirty) persist();
    }, SAVE_DEBOUNCE_MS);
  }

  function paramsObj(params) {
    if (!params || (Array.isArray(params) && params.length === 0)) return undefined;
    return params;
  }

  function run(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      stmt.step();
      const changes = db.getRowsModified();
      const lastInsertRowid = db.exec("SELECT last_insert_rowid() as id")[0]?.values?.[0]?.[0] ?? null;
      scheduleSave();
      return { changes, lastInsertRowid };
    } finally {
      stmt.free();
    }
  }

  function get(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      if (stmt.step()) return stmt.getAsObject();
      return undefined;
    } finally {
      stmt.free();
    }
  }

  function all(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function exec(sql) {
    db.exec(sql);
    scheduleSave();
  }

  function transaction(fn) {
    const sp = `sp_${Math.random().toString(36).slice(2)}`;
    db.exec(`SAVEPOINT ${sp}`);
    try {
      const result = fn();
      db.exec(`RELEASE ${sp}`);
      scheduleSave();
      return result;
    } catch (e) {
      try { db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`); } catch {}
      throw e;
    }
  }

  function close() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (dirty) persist();
    db.close();
  }

  return { driver: "sql.js", run, get, all, exec, transaction, close, raw: db };
}