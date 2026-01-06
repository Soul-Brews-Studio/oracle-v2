/**
 * Oracle v2 Drizzle Database Client
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import path from 'path';
import * as schema from './schema.js';

// Configuration (matches existing server/db.ts)
const REPO_ROOT = process.env.ORACLE_REPO_ROOT || '/Users/nat/Code/github.com/laris-co/Nat-s-Agents';
export const DB_PATH = path.join(REPO_ROOT, 'ψ/lab/oracle-v2/oracle.db');

// Create bun:sqlite connection
const sqlite = new Database(DB_PATH);

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// Export schema for use in queries
export * from './schema.js';

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
      concepts
    )
  `);
}

/**
 * Close database connection
 */
export function closeDb() {
  sqlite.close();
}
