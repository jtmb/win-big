import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { Draw, Prediction, JobRecord } from './preload';

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

  // Job history table — completed prediction runs
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lottery TEXT NOT NULL CHECK(lottery IN ('649', 'max')),
      draw_count INTEGER NOT NULL,
      prediction TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

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

export function getExistingDrawDates(lottery: '649' | 'max'): Set<string> {
  const database = getDB();
  const stmt = database.prepare('SELECT draw_date FROM draws WHERE lottery = ?');
  stmt.bind([lottery]);
  const dates = new Set<string>();
  while (stmt.step()) {
    dates.add(stmt.getAsObject().draw_date as string);
  }
  stmt.free();
  return dates;
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

export function clearAllData(): void {
  const database = getDB();
  database.run('DELETE FROM draws');
  database.run('DELETE FROM jobs');
  persistDB();
}

export function getDbStats(): { draws: number; jobs: number } {
  const database = getDB();
  const drawsStmt = database.prepare('SELECT COUNT(*) as cnt FROM draws');
  let draws = 0;
  if (drawsStmt.step()) draws = Number(drawsStmt.getAsObject().cnt) || 0;
  drawsStmt.free();
  const jobsStmt = database.prepare('SELECT COUNT(*) as cnt FROM jobs');
  let jobs = 0;
  if (jobsStmt.step()) jobs = Number(jobsStmt.getAsObject().cnt) || 0;
  jobsStmt.free();
  return { draws, jobs };
}

// ---- Job History ----

export function saveJob(lottery: '649' | 'max', drawCount: number, prediction: Prediction): number {
  const database = getDB();
  database.run(
    'INSERT INTO jobs (lottery, draw_count, prediction) VALUES (?, ?, ?)',
    [lottery, drawCount, JSON.stringify(prediction)]
  );
  persistDB();
  // Return the last inserted row ID
  const stmt = database.prepare('SELECT last_insert_rowid() as id');
  let id = 0;
  if (stmt.step()) {
    id = Number(stmt.getAsObject().id) || 0;
  }
  stmt.free();
  return id;
}

export function getJobs(lottery?: '649' | 'max', limit: number = 50): JobRecord[] {
  const database = getDB();
  const query = lottery
    ? 'SELECT * FROM jobs WHERE lottery = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?';
  const stmt = database.prepare(query);
  if (lottery) {
    stmt.bind([lottery, limit]);
  } else {
    stmt.bind([limit]);
  }
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(r => ({
    id: r.id as number,
    lottery: r.lottery as '649' | 'max',
    drawCount: r.draw_count as number,
    prediction: JSON.parse(r.prediction as string) as Prediction,
    createdAt: r.created_at as string,
  }));
}

export function getLatestDrawDate(lottery: '649' | 'max'): string | null {
  const database = getDB();
  const stmt = database.prepare('SELECT draw_date FROM draws WHERE lottery = ? ORDER BY draw_date DESC LIMIT 1');
  stmt.bind([lottery]);
  let date: string | null = null;
  if (stmt.step()) {
    date = stmt.getAsObject().draw_date as string;
  }
  stmt.free();
  return date;
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}
