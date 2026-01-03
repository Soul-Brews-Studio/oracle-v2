/**
 * Oracle v2 Database Configuration
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
export const PORT = process.env.ORACLE_PORT || 37778;
export const REPO_ROOT = process.env.ORACLE_REPO_ROOT || '/Users/nat/Code/github.com/laris-co/Nat-s-Agents';
export const DB_PATH = path.join(REPO_ROOT, 'ψ/lab/oracle-v2/oracle.db');
export const UI_PATH = path.join(REPO_ROOT, 'ψ/lab/oracle-v2/src/ui.html');
export const ARTHUR_UI_PATH = path.join(REPO_ROOT, 'ψ/lab/oracle-jarvis/index.html');
export const DASHBOARD_PATH = path.join(__dirname, '..', 'dashboard.html');

// Initialize database connection
export const db: DatabaseType = new Database(DB_PATH);

/**
 * Initialize logging tables
 */
export function initLoggingTables() {
  // Search query log
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      type TEXT,
      mode TEXT,
      results_count INTEGER,
      search_time_ms INTEGER,
      created_at INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_search_created ON search_log(created_at)`);

  // Learning log
  db.exec(`
    CREATE TABLE IF NOT EXISTS learn_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      pattern_preview TEXT,
      source TEXT,
      concepts TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_learn_created ON learn_log(created_at)`);

  // Document access log
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      access_type TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_access_doc ON document_access(document_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_access_created ON document_access(created_at)`);

  // Consult log
  db.exec(`
    CREATE TABLE IF NOT EXISTS consult_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision TEXT NOT NULL,
      context TEXT,
      principles_found INTEGER,
      patterns_found INTEGER,
      guidance TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_consult_created ON consult_log(created_at)`);
}

/**
 * Close database connection
 */
export function closeDb() {
  db.close();
}
