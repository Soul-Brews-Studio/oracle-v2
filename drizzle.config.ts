import { defineConfig } from 'drizzle-kit';
import path from 'path';

// Default to oracle.db in same directory as this config
const DB_PATH = process.env.ORACLE_DB_PATH || path.join(__dirname, 'oracle.db');

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: DB_PATH,
  },
  // Exclude FTS5 internal tables (managed by SQLite, not Drizzle)
  tablesFilter: [
    'oracle_documents',
    'indexing_status',
    'search_log',
    'consult_log',
    'learn_log',
    'document_access',
  ],
});
