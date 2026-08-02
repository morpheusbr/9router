import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'node:fs';

/** Load SQLite driver via sql.js (bypasses glibc 2.29 native binding errors on CentOS 8) */
async function loadSqlDriver() {
  const sqlJsMod = await import('sql.js');
  const initSqlJs = sqlJsMod.default ?? sqlJsMod;
  const sqlJs = await initSqlJs({ locateFile: f => new URL(`sql.js/dist/${f}`, import.meta.url).pathname });
  // Wrap sql.js to look like better-sqlite3 API (get()/all() only)
  return class SqlJsLite {
    #db;
    constructor(file) {
      if (!fs.existsSync(file)) throw new Error('DB not found');
      const buf = fs.readFileSync(file);
      this.#db = new sqlJs.Database(buf);
    }
    prepare(sql) {
      const db = this.#db;
      return { get(...p) { const s = db.prepare(sql); if (p.length) s.bind(p); const r = s.getAsObject(); s.free(); return r; },
               all(...p) { const s = db.prepare(sql); if (p.length) s.bind(p); const rows = []; while (s.step()) rows.push(s.getAsObject()); s.free(); return rows; } };
    }
    close() { this.#db.close(); }
  };
}

export async function GET() {
  try {
    // Attempt to locate the RTK history db
    let dbPath = path.join(os.homedir(), '.local', 'share', 'rtk', 'history.db');

    // Fallback if running under different user (www vs root vs real user)
    if (!fs.existsSync(dbPath)) {
      const fallbacks = [
        '/root/.local/share/rtk/history.db',
        '/home/fabio/.local/share/rtk/history.db'
      ];

      // Tenta achar em qualquer usuário do /home
      if (fs.existsSync('/home')) {
        const users = fs.readdirSync('/home');
        users.forEach(u => fallbacks.push(`/home/${u}/.local/share/rtk/history.db`));
      }

      for (const f of fallbacks) {
        if (fs.existsSync(f)) {
          dbPath = f;
          break;
        }
      }
    }

    // Se DB não existe, retorna dados vazios com mensagem informativa
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({
        success: true,
        stats: {
          totalCommands: 0,
          inputTokens: 0,
          outputTokens: 0,
          savedTokens: 0,
          totalExecTimeMs: 0
        },
        topCommands: [],
        history: [],
        info: "RTK history database not found. Run RTK CLI to collect token savings data."
      });
    }

    const Database = await loadSqlDriver();
    const db = new Database(dbPath);
    db.readonly = true;

    // Aggregate stats
    const statsRow = db.prepare(`
      SELECT
        COUNT(id) as total_commands,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(saved_tokens) as saved_tokens,
        SUM(exec_time_ms) as total_exec_time_ms
      FROM commands
    `).get();

    // Top commands
    const topCommands = db.prepare(`
      SELECT
        original_cmd,
        COUNT(id) as count,
        SUM(saved_tokens) as saved,
        AVG(savings_pct) as avg_pct,
        SUM(exec_time_ms) as total_time
      FROM commands
      GROUP BY original_cmd
      ORDER BY saved DESC
      LIMIT 10
    `).all();

    // Recent history
    const history = db.prepare(`
      SELECT id, timestamp, original_cmd, saved_tokens, savings_pct, exec_time_ms
      FROM commands
      ORDER BY timestamp DESC
      LIMIT 50
    `).all();

    db.close();

    return NextResponse.json({
      success: true,
      stats: {
        totalCommands: statsRow.total_commands || 0,
        inputTokens: statsRow.input_tokens || 0,
        outputTokens: statsRow.output_tokens || 0,
        savedTokens: statsRow.saved_tokens || 0,
        totalExecTimeMs: statsRow.total_exec_time_ms || 0
      },
      topCommands,
      history
    });
  } catch (error) {
    console.error('Erro ao ler DB do RTK:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
