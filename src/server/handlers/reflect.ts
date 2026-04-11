/**
 * Reflect Handler
 *
 * Get random wisdom from principles and learnings.
 */

import { eq, or, sql } from 'drizzle-orm';
import { db, sqlite, oracleDocuments } from '../../db/index.ts';

/**
 * Get random wisdom (principle or learning document)
 */
export function handleReflect() {
  // Get random document using Drizzle
  const randomDoc = db.select({
    id: oracleDocuments.id,
    type: oracleDocuments.type,
    sourceFile: oracleDocuments.sourceFile,
    concepts: oracleDocuments.concepts
  })
    .from(oracleDocuments)
    .where(or(
      eq(oracleDocuments.type, 'principle'),
      eq(oracleDocuments.type, 'learning')
    ))
    .orderBy(sql`RANDOM()`)
    .limit(1)
    .get();

  if (!randomDoc) {
    return { error: 'No documents found' };
  }

  // Get content from FTS (must use raw SQL)
  const content = sqlite.prepare(`
    SELECT content FROM oracle_fts WHERE id = ?
  `).get(randomDoc.id) as { content: string } | undefined;

  if (!content) {
    return { error: 'Document content not found in FTS index' };
  }

  return {
    id: randomDoc.id,
    type: randomDoc.type,
    content: content.content,
    source_file: randomDoc.sourceFile,
    concepts: JSON.parse(randomDoc.concepts || '[]')
  };
}
