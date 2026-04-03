/**
 * Graph Handler
 *
 * Knowledge graph data with nodes and links based on shared concepts.
 */

import { eq, sql } from 'drizzle-orm';
import { db, oracleDocuments } from '../../db/index.ts';

/**
 * Get knowledge graph data
 * Accepts `limit` per type (default 200, max 500).
 * Links capped at 5000.
 */
export function handleGraph(limitPerType = 310) {
  const perType = Math.min(Math.max(limitPerType, 10), 500);

  const selectFields = {
    id: oracleDocuments.id,
    type: oracleDocuments.type,
    sourceFile: oracleDocuments.sourceFile,
    concepts: oracleDocuments.concepts,
    project: oracleDocuments.project
  };

  // Get random sample from each type
  const principles = db.select(selectFields)
    .from(oracleDocuments)
    .where(eq(oracleDocuments.type, 'principle'))
    .orderBy(sql`RANDOM()`)
    .limit(perType)
    .all();

  const learnings = db.select(selectFields)
    .from(oracleDocuments)
    .where(eq(oracleDocuments.type, 'learning'))
    .orderBy(sql`RANDOM()`)
    .limit(perType)
    .all();

  const retros = db.select(selectFields)
    .from(oracleDocuments)
    .where(eq(oracleDocuments.type, 'retro'))
    .orderBy(sql`RANDOM()`)
    .limit(perType)
    .all();

  const docs = [...principles, ...learnings, ...retros];

  // Build nodes
  const nodes = docs.map(doc => ({
    id: doc.id,
    type: doc.type,
    source_file: doc.sourceFile,
    project: doc.project,
    concepts: JSON.parse(doc.concepts || '[]')
  }));

  // Build links based on shared concepts (require 1+ shared)
  const links: { source: string; target: string; weight: number }[] = [];
  const MAX_LINKS = 5000;

  // Pre-compute concept sets
  const conceptSets = nodes.map(n => new Set(n.concepts));

  for (let i = 0; i < nodes.length && links.length < MAX_LINKS; i++) {
    for (let j = i + 1; j < nodes.length && links.length < MAX_LINKS; j++) {
      const sharedCount = nodes[j].concepts.filter((c: string) => conceptSets[i].has(c)).length;

      if (sharedCount >= 1) {
        links.push({
          source: nodes[i].id,
          target: nodes[j].id,
          weight: sharedCount
        });
      }
    }
  }

  return { nodes, links };
}
