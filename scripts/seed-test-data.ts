#!/usr/bin/env bun
/**
 * Seed minimal test data for integration tests
 */
import Database from "bun:sqlite";
import path from "path";

const ORACLE_DATA_DIR = process.env.ORACLE_DATA_DIR ||
  path.join(process.env.HOME || '/tmp', '.oracle');
const DB_PATH = process.env.ORACLE_DB_PATH || path.join(ORACLE_DATA_DIR, 'oracle.db');

console.log(`Seeding test data to: ${DB_PATH}`);

const db = new Database(DB_PATH);

// Create FTS5 table if not exists (not managed by drizzle)
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS oracle_fts USING fts5(
    id,
    type,
    title,
    content,
    concepts,
    tokenize = 'porter unicode61'
  );
`);

const now = Date.now();

// Insert test documents into main table
const insertDoc = db.prepare(`
  INSERT OR IGNORE INTO oracle_documents (id, type, source_file, concepts, created_at, updated_at, indexed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// Insert into FTS5 table for content search
const insertFts = db.prepare(`
  INSERT OR IGNORE INTO oracle_fts (id, type, title, content, concepts)
  VALUES (?, ?, ?, ?, ?)
`);

const testDocs = [
  {
    id: 'test_principle_1',
    type: 'principle',
    title: 'Nothing is Deleted',
    content: 'All data is preserved. History is append-only. Timestamps are truth.',
    concepts: '["oracle", "philosophy", "data"]',
    source_file: 'test/principle.md'
  },
  {
    id: 'test_learning_1',
    type: 'learning',
    title: 'Test Learning',
    content: 'This is a test learning for integration tests.',
    concepts: '["test", "ci"]',
    source_file: 'test/learning.md'
  },
  {
    id: 'test_pattern_1',
    type: 'pattern',
    title: 'Test Pattern',
    content: 'Patterns guide behavior. This is a test pattern.',
    concepts: '["test", "pattern"]',
    source_file: 'test/pattern.md'
  }
];

for (const doc of testDocs) {
  // Main table
  insertDoc.run(
    doc.id,
    doc.type,
    doc.source_file,
    doc.concepts,
    now,
    now,
    now
  );
  // FTS5 table
  insertFts.run(
    doc.id,
    doc.type,
    doc.title,
    doc.content,
    doc.concepts
  );
}

console.log(`✅ Seeded ${testDocs.length} test documents`);
db.close();
