import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'finances.db');

let db;

export async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      recurrence TEXT DEFAULT 'one-time',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      payment_method TEXT DEFAULT 'other',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      cycle TEXT DEFAULT 'monthly',
      category TEXT DEFAULT 'Other',
      renewal_date TEXT,
      active INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS budget_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT UNIQUE NOT NULL,
      monthly_limit REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL,
      currency TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Default settings
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'BRL')");
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency_symbol', 'R$')");

  // Migrations
  try { db.run("ALTER TABLE income ADD COLUMN account_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE expenses ADD COLUMN account_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE income ADD COLUMN is_transfer INTEGER DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE expenses ADD COLUMN is_transfer INTEGER DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE income ADD COLUMN ignore_dashboard INTEGER DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE expenses ADD COLUMN ignore_dashboard INTEGER DEFAULT 0"); } catch(e) {}

  // Triggers for automatic account balance updates
  try {
    db.run(`
      CREATE TRIGGER IF NOT EXISTS after_income_insert AFTER INSERT ON income WHEN NEW.account_id IS NOT NULL BEGIN UPDATE accounts SET balance = balance + NEW.amount WHERE id = NEW.account_id; END;
      CREATE TRIGGER IF NOT EXISTS after_income_update AFTER UPDATE ON income BEGIN
        UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id AND OLD.account_id IS NOT NULL;
        UPDATE accounts SET balance = balance + NEW.amount WHERE id = NEW.account_id AND NEW.account_id IS NOT NULL;
      END;
      CREATE TRIGGER IF NOT EXISTS after_income_delete AFTER DELETE ON income WHEN OLD.account_id IS NOT NULL BEGIN UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id; END;

      CREATE TRIGGER IF NOT EXISTS after_expenses_insert AFTER INSERT ON expenses WHEN NEW.account_id IS NOT NULL BEGIN UPDATE accounts SET balance = balance - NEW.amount WHERE id = NEW.account_id; END;
      CREATE TRIGGER IF NOT EXISTS after_expenses_update AFTER UPDATE ON expenses BEGIN
        UPDATE accounts SET balance = balance + OLD.amount WHERE id = OLD.account_id AND OLD.account_id IS NOT NULL;
        UPDATE accounts SET balance = balance - NEW.amount WHERE id = NEW.account_id AND NEW.account_id IS NOT NULL;
      END;
      CREATE TRIGGER IF NOT EXISTS after_expenses_delete AFTER DELETE ON expenses WHEN OLD.account_id IS NOT NULL BEGIN UPDATE accounts SET balance = balance + OLD.amount WHERE id = OLD.account_id; END;
    `);
  } catch (e) {
    console.error('Trigger creation error:', e);
  }

  persist();
  console.log('✅ SQLite database ready:', DB_PATH);
  return db;
}

// Save in-memory DB to file after every write
export function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Helper: run a query and return all rows as objects
export function all(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (e) {
    console.error('DB all() error:', e.message, sql);
    return [];
  }
}

// Helper: run a query and return first row as object
export function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

// Helper: run a write query, persist, return lastInsertRowid
export function run(sql, params = []) {
  try {
    db.run(sql, params);
    const changes = db.getRowsModified();
    persist();
    const row = get('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: row?.id || null, changes };
  } catch (e) {
    console.error('DB run() error:', e.message, sql);
    throw e;
  }
}

export default { all, get, run, persist };
