/**
 * Oracle v2 Database Configuration
 */

import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
export const PORT = process.env.ORACLE_PORT || 47778;
export const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/tmp';
export const ORACLE_DATA_DIR = process.env.ORACLE_DATA_DIR || path.join(HOME_DIR, '.oracle-v2');
export const DB_PATH = process.env.ORACLE_DB_PATH || path.join(ORACLE_DATA_DIR, 'oracle.db');
export const UI_PATH = path.join(__dirname, '..', 'ui.html');
export const DASHBOARD_PATH = path.join(__dirname, '..', 'dashboard.html');
export const ARTHUR_UI_PATH = path.join(__dirname, '..', 'arthur.html');

// REPO_ROOT for features that need knowledge base context
// When running from source: defaults to project root (where ψ/ lives)
// When running via bunx: set ORACLE_REPO_ROOT explicitly
// Fallback: ~/.oracle-v2 for bunx installs
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
export const REPO_ROOT = process.env.ORACLE_REPO_ROOT ||
  (fs.existsSync(path.join(PROJECT_ROOT, 'ψ')) ? PROJECT_ROOT : ORACLE_DATA_DIR);

// Ensure data directory exists (for fresh installs via bunx)
if (!fs.existsSync(ORACLE_DATA_DIR)) {
  fs.mkdirSync(ORACLE_DATA_DIR, { recursive: true });
}

// Initialize database connection
export const db = new Database(DB_PATH);

/**
 * Bootstrap core tables for fresh bunx installs
 * (Drizzle migrations are source of truth, this is fallback)
 */
export function bootstrapCoreTables() {
  // Check if main table exists
  const tableExists = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='oracle_documents'"
  ).get();

  if (!tableExists) {
    console.error('[Bootstrap] Creating core tables for fresh install...');

    // Main documents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS oracle_documents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source_file TEXT NOT NULL,
        concepts TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL,
        superseded_by TEXT,
        superseded_at INTEGER,
        superseded_reason TEXT,
        origin TEXT,
        project TEXT,
        created_by TEXT
      )
    `);

    // FTS5 for content search
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS oracle_fts USING fts5(
        id, type, title, content, concepts,
        tokenize = 'porter unicode61'
      )
    `);

    // Indexing status
    db.exec(`
      CREATE TABLE IF NOT EXISTS indexing_status (
        id INTEGER PRIMARY KEY,
        is_indexing INTEGER NOT NULL DEFAULT 0,
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 0,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT,
        repo_root TEXT
      )
    `);

    // Forum tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS forum_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        created_by TEXT DEFAULT 'human',
        status TEXT DEFAULT 'active',
        project TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS forum_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // Trace log table
    db.exec(`
      CREATE TABLE IF NOT EXISTS trace_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT UNIQUE NOT NULL,
        query TEXT NOT NULL,
        query_type TEXT DEFAULT 'general',
        found_files TEXT,
        found_commits TEXT,
        found_issues TEXT,
        status TEXT DEFAULT 'raw',
        project TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    console.error('[Bootstrap] Core tables created');
  }
}

// Auto-bootstrap on import
bootstrapCoreTables();

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

  // Add project column to logging tables (migration)
  // SQLite doesn't have IF NOT EXISTS for columns, so use try/catch
  const tables = ['search_log', 'learn_log', 'document_access', 'consult_log'];
  for (const table of tables) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN project TEXT`);
    } catch {
      // Column already exists, ignore
    }
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_search_project ON search_log(project)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_learn_project ON learn_log(project)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_access_project ON document_access(project)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_consult_project ON consult_log(project)`);
}

/**
 * Close database connection
 */
export function closeDb() {
  db.close();
}
