/**
 * Oracle v2 Drizzle Database Client
 *
 * Single source of truth for DB initialization:
 * 1. Drizzle migrations (schema tables)
 * 2. FTS5 virtual table (raw SQL, can't be managed by Drizzle)
 * 3. Seed indexing_status row
 */

import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';
import * as schema from './schema.ts';
import { DB_PATH, ORACLE_DATA_DIR } from '../config.ts';

// Migrations folder (relative to this file)
const MIGRATIONS_FOLDER = path.join(import.meta.dirname || __dirname, 'migrations');

/**
 * Initialize FTS5 virtual table (must use raw SQL)
 * Drizzle doesn't manage FTS5 — this is idempotent.
 */
export function initFts5(sqliteDb: Database): void {
  sqliteDb.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS oracle_fts USING fts5(
      id UNINDEXED,
      content,
      concepts,
      tokenize='porter unicode61'
    )
  `);
}

/**
 * Initialize a database: run migrations, create FTS5, seed indexing_status.
 */
function initializeDatabase(sqliteDb: Database, drizzleDb: BunSQLiteDatabase<typeof schema>): void {
  // WAL mode for concurrent reads
  sqliteDb.exec('PRAGMA journal_mode = WAL');
  sqliteDb.exec('PRAGMA busy_timeout = 5000');

  // Run Drizzle migrations (creates/updates all schema tables)
  migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });

  // FTS5 (raw SQL, idempotent)
  initFts5(sqliteDb);

  // Ensure indexing_status has its single row
  sqliteDb.exec('INSERT OR IGNORE INTO indexing_status (id, is_indexing) VALUES (1, 0)');

  // One-time migration: normalize project casing to lowercase
  sqliteDb.exec("UPDATE oracle_documents SET project = LOWER(project) WHERE project <> LOWER(project)");
}

/**
 * Create a fully-initialized database connection.
 * Used by MCP entry (src/index.ts) and indexer (src/indexer.ts).
 */
export function createDatabase(dbPath?: string): {
  sqlite: Database;
  db: BunSQLiteDatabase<typeof schema>;
} {
  const resolvedPath = dbPath || DB_PATH;

  // Ensure parent directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqliteDb = new Database(resolvedPath);
  const drizzleDb = drizzle(sqliteDb, { schema });

  initializeDatabase(sqliteDb, drizzleDb);

  return { sqlite: sqliteDb, db: drizzleDb };
}

// ============================================================================
// Default module-level connection (used by server.ts, handlers, etc.)
// ============================================================================

// Ensure data dir exists before opening DB
if (!fs.existsSync(ORACLE_DATA_DIR)) {
  fs.mkdirSync(ORACLE_DATA_DIR, { recursive: true });
}

const defaultSqlite = new Database(DB_PATH);
const defaultDb = drizzle(defaultSqlite, { schema });

// Run initialization on the default connection
initializeDatabase(defaultSqlite, defaultDb);

export const sqlite = defaultSqlite;
export const db = defaultDb;

// Export schema for use in queries
export * from './schema.ts';

/**
 * Rebuild FTS5 table with Porter stemmer
 * Required when upgrading from non-stemmed to stemmed FTS
 */
export function rebuildFts5WithStemmer() {
  console.log('[FTS5] Starting rebuild with Porter stemmer...');

  const existingData = sqlite.prepare('SELECT id, content, concepts FROM oracle_fts').all() as {
    id: string;
    content: string;
    concepts: string;
  }[];
  console.log(`[FTS5] Backed up ${existingData.length} documents`);

  sqlite.exec('DROP TABLE IF EXISTS oracle_fts');

  sqlite.exec(`
    CREATE VIRTUAL TABLE oracle_fts USING fts5(
      id UNINDEXED,
      content,
      concepts,
      tokenize='porter unicode61'
    )
  `);
  console.log('[FTS5] Created new table with Porter stemmer');

  const insertStmt = sqlite.prepare('INSERT INTO oracle_fts (id, content, concepts) VALUES (?, ?, ?)');
  for (const row of existingData) {
    insertStmt.run(row.id, row.content, row.concepts);
  }
  console.log(`[FTS5] Re-inserted ${existingData.length} documents`);

  return existingData.length;
}

/**
 * Close database connection
 */
export function closeDb() {
  defaultSqlite.close();
}
