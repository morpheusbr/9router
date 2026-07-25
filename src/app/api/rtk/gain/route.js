import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

export async function GET() {
  try {
    // Attempt to locate the RTK history db
    const dbPath = path.join(os.homedir(), '.local', 'share', 'rtk', 'history.db');
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
