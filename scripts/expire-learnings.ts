#!/usr/bin/env bun
/**
 * Expire stale learnings — cron-based cleanup script (Issue #4)
 *
 * Finds documents where expires_at has passed and marks them as superseded.
 * Follows "Nothing is Deleted" principle — documents are superseded, not removed.
 *
 * Usage:
 *   bun scripts/expire-learnings.ts          # Run expiry
 *   bun scripts/expire-learnings.ts --dry-run # Preview without changes
 *
 * Cron: 0 1 * * * cd ~/repos/memory/arra-oracle-v3 && bun run expire
 */

import { createDatabase } from '../src/db/index.ts';

const dryRun = process.argv.includes('--dry-run');
const { sqlite } = createDatabase();
const now = Date.now();

// Find expired documents that haven't been superseded yet
const expired = sqlite.prepare(`
  SELECT id, source_file, ttl_days, expires_at, project
  FROM oracle_documents
  WHERE expires_at IS NOT NULL
    AND expires_at <= ?
    AND superseded_by IS NULL
`).all(now) as Array<{
  id: string;
  source_file: string;
  ttl_days: number | null;
  expires_at: number;
  project: string | null;
}>;

if (expired.length === 0) {
  console.log('No expired documents found.');
  process.exit(0);
}

console.log(`Found ${expired.length} expired document(s)${dryRun ? ' (dry-run)' : ''}:`);

if (dryRun) {
  for (const doc of expired) {
    const expiredDate = new Date(doc.expires_at).toISOString().split('T')[0];
    console.log(`  - ${doc.id} (TTL: ${doc.ttl_days}d, expired: ${expiredDate})`);
  }
  process.exit(0);
}

// Batch expire in a transaction
const updateDoc = sqlite.prepare(`
  UPDATE oracle_documents
  SET superseded_by = 'system:auto-expire',
      superseded_at = ?,
      superseded_reason = ?
  WHERE id = ?
`);

const insertLog = sqlite.prepare(`
  INSERT INTO supersede_log (old_path, old_id, old_title, old_type, reason, superseded_at, superseded_by, project)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const transaction = sqlite.transaction(() => {
  for (const doc of expired) {
    const reason = `Auto-expired after ${doc.ttl_days ?? '?'} days`;

    updateDoc.run(now, reason, doc.id);

    // Get title for audit log
    const ftsRow = sqlite.prepare('SELECT content FROM oracle_fts WHERE id = ?').get(doc.id) as { content: string } | null;
    const title = ftsRow?.content.split('\n')[0]?.substring(0, 80) ?? doc.id;

    insertLog.run(
      doc.source_file,   // old_path
      doc.id,            // old_id
      title,             // old_title
      'learning',        // old_type
      reason,            // reason
      now,               // superseded_at
      'system:auto-expire', // superseded_by
      doc.project,       // project
    );

    console.log(`  Expired: ${doc.id} (TTL: ${doc.ttl_days}d)`);
  }
});

transaction();

console.log(`\nDone. Expired ${expired.length} document(s).`);
