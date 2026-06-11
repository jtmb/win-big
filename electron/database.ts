import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { Draw } from './preload';

let db: SqlJsDatabase | null = null;
let _dbPath: string;

function getDbPath(): string {
  if (!_dbPath) {
    _dbPath = path.join(app.getPath('userData'), 'winbig-draws.db');
  }
  return _dbPath;
}

export async function initDB(): Promise<SqlJsDatabase> {
  if (db) return db;

  const SQL = await initSqlJs();
  const filePath = getDbPath();

  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');
  db.run(`
    CREATE TABLE IF NOT EXISTS draws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lottery TEXT NOT NULL CHECK(lottery IN ('649', 'max')),
      draw_date TEXT NOT NULL,
      numbers TEXT NOT NULL,
      bonus INTEGER NOT NULL,
      encore TEXT NOT NULL,
      gold_ball TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  try {
    db.run('CREATE UNIQUE INDEX idx_draws_lottery_date ON draws(lottery, draw_date)');
  } catch {
    // Index might already exist
  }

  persistDB();
  return db;
}

function persistDB(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(getDbPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getDbPath(), buffer);
}

function getDB(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

function rowToDraw(row: any): Draw {
  return {
    id: row.id as number,
    lottery: row.lottery as '649' | 'max',
    drawDate: row.draw_date as string,
    numbers: JSON.parse(row.numbers as string),
    bonus: row.bonus as number,
    encore: row.encore as string,
    goldBall: (row.gold_ball as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export function insertDraw(draw: Omit<Draw, 'id' | 'createdAt'>): void {
  const database = getDB();
  database.run(
    'INSERT OR IGNORE INTO draws (lottery, draw_date, numbers, bonus, encore, gold_ball) VALUES (?, ?, ?, ?, ?, ?)',
    [draw.lottery, draw.drawDate, JSON.stringify(draw.numbers), draw.bonus, draw.encore, draw.goldBall ?? null]
  );
  persistDB();
}

export function insertDraws(draws: Omit<Draw, 'id' | 'createdAt'>[]): number {
  const database = getDB();
  let count = 0;
  const stmt = 'INSERT OR IGNORE INTO draws (lottery, draw_date, numbers, bonus, encore, gold_ball) VALUES (?, ?, ?, ?, ?, ?)';
  database.run('BEGIN TRANSACTION');
  for (const draw of draws) {
    database.run(stmt, [
      draw.lottery, draw.drawDate, JSON.stringify(draw.numbers),
      draw.bonus, draw.encore, draw.goldBall ?? null,
    ]);
    count++;
  }
  database.run('COMMIT');
  persistDB();
  return count;
}

export function getDraws(lottery: '649' | 'max', limit?: number): Draw[] {
  const database = getDB();
  const query = limit
    ? 'SELECT * FROM draws WHERE lottery = ? ORDER BY draw_date DESC LIMIT ?'
    : 'SELECT * FROM draws WHERE lottery = ? ORDER BY draw_date DESC';

  const stmt = database.prepare(query);
  if (limit !== undefined) {
    stmt.bind([lottery, limit]);
  } else {
    stmt.bind([lottery]);
  }

  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows.map(rowToDraw);
}

export function getDrawCount(lottery: '649' | 'max'): number {
  const database = getDB();
  const stmt = database.prepare('SELECT COUNT(*) as cnt FROM draws WHERE lottery = ?');
  stmt.bind([lottery]);
  let count = 0;
  if (stmt.step()) {
    const obj = stmt.getAsObject();
    count = Number(obj.cnt) || 0;
  }
  stmt.free();
  return count;
}

export function clearDraws(lottery: '649' | 'max'): void {
  const database = getDB();
  database.run('DELETE FROM draws WHERE lottery = ?', [lottery]);
  persistDB();
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}
