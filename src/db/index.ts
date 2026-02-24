/**
 * Oracle v2 Drizzle Database Client
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import path from 'path';
import * as schema from './schema.ts';

// Configuration - central location: ~/.oracle-v2/
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/tmp';
const ORACLE_DATA_DIR = process.env.ORACLE_DATA_DIR || path.join(HOME_DIR, '.oracle-v2');
export const DB_PATH = process.env.ORACLE_DB_PATH || path.join(ORACLE_DATA_DIR, 'oracle.db');

// Create bun:sqlite connection
const sqlite = new Database(DB_PATH);

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// Export schema for use in queries
export * from './schema.ts';

// Raw SQLite connection for FTS5 operations
export { sqlite };

/**
 * Initialize FTS5 virtual table (must use raw SQL)
 * Called separately since Drizzle doesn't manage FTS5
 */
export function initFts5() {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS oracle_fts USING fts5(
      id UNINDEXED,
      content,
      concepts,
      tokenize='porter unicode61'
    )
  `);
}

/**
 * Rebuild FTS5 table with Porter stemmer
 * Required when upgrading from non-stemmed to stemmed FTS
 */
export function rebuildFts5WithStemmer() {
  console.log('[FTS5] Starting rebuild with Porter stemmer...');

  // Backup existing data
  const existingData = sqlite.prepare('SELECT id, content, concepts FROM oracle_fts').all() as {
    id: string;
    content: string;
    concepts: string;
  }[];
  console.log(`[FTS5] Backed up ${existingData.length} documents`);

  // Drop old table
  sqlite.exec('DROP TABLE IF EXISTS oracle_fts');

  // Create new table with Porter stemmer
  sqlite.exec(`
    CREATE VIRTUAL TABLE oracle_fts USING fts5(
      id UNINDEXED,
      content,
      concepts,
      tokenize='porter unicode61'
    )
  `);
  console.log('[FTS5] Created new table with Porter stemmer');

  // Re-insert data
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
  sqlite.close();
}
