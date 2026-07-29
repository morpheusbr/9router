import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

export async function GET() {
  try {
    // Attempt to locate the RTK history db
    let dbPath = path.join(os.homedir(), '.local', 'share', 'rtk', 'history.db');

    // Fallback if running under different user (www vs root vs real user)
    const fs = require('fs');
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

    const db = new Database(dbPath, { readonly: true });

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
