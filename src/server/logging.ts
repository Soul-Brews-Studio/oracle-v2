/**
 * Oracle v2 Logging Functions
 *
 * Refactored to use Drizzle ORM for type-safe queries.
 */

import { db, searchLog, documentAccess, learnLog, consultLog } from '../db/index.ts';
import type { SearchResult } from './types.ts';

/**
 * Log search query with full details
 */
export function logSearch(
  query: string,
  type: string,
  mode: string,
  resultsCount: number,
  searchTimeMs: number,
  results: SearchResult[] = [],
  project?: string
) {
  try {
    // Store top 5 results as JSON (id, type, score, snippet)
    const resultsJson = results.length > 0
      ? JSON.stringify(results.slice(0, 5).map(r => ({
          id: r.id,
          type: r.type,
          score: r.score,
          snippet: r.content?.substring(0, 100)
        })))
      : null;

    db.insert(searchLog).values({
      query,
      type,
      mode,
      resultsCount,
      searchTimeMs,
      createdAt: Date.now(),
      project: project || null,
      results: resultsJson,
    }).run();

    // Comprehensive console logging
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[SEARCH] ${new Date().toISOString()}`);
    if (project) console.log(`  Project: ${project}`);
    console.log(`  Query: "${query}"`);
    console.log(`  Type: ${type} | Mode: ${mode}`);
    console.log(`  Results: ${resultsCount} in ${searchTimeMs}ms`);

    if (results.length > 0) {
      console.log(`  Top Results:`);
      results.slice(0, 5).forEach((r, i) => {
        console.log(`    ${i + 1}. [${r.type}] score=${r.score || 'N/A'} id=${r.id}`);
        console.log(`       ${r.content?.substring(0, 80)}...`);
      });
    }

    // Log any unexpected fields
    if (results.length > 0) {
      const expectedFields = ['id', 'type', 'content', 'source_file', 'concepts', 'source', 'score'];
      const firstResult = results[0] as unknown as Record<string, unknown>;
      const unknownFields = Object.keys(firstResult).filter(k => !expectedFields.includes(k));
      if (unknownFields.length > 0) {
        console.log(`  [UNKNOWN FIELDS]: ${unknownFields.join(', ')}`);
      }
    }
    console.log(`${'='.repeat(60)}\n`);
  } catch (e) {
    console.error('Failed to log search:', e);
  }
}

/**
 * Log document access
 */
export function logDocumentAccess(documentId: string, accessType: string, project?: string) {
  try {
    db.insert(documentAccess).values({
      documentId,
      accessType,
      createdAt: Date.now(),
      project: project || null,
    }).run();
  } catch (e) {
    console.error('Failed to log access:', e);
  }
}

/**
 * Log learning addition
 */
export function logLearning(documentId: string, patternPreview: string, source: string, concepts: string[], project?: string) {
  try {
    db.insert(learnLog).values({
      documentId,
      patternPreview: patternPreview.substring(0, 100),
      source: source || 'Oracle Learn',
      concepts: JSON.stringify(concepts),
      createdAt: Date.now(),
      project: project || null,
    }).run();
  } catch (e) {
    console.error('Failed to log learning:', e);
  }
}

/**
 * Log consultation with full details
 */
export function logConsult(
  decision: string,
  context: string,
  principlesFound: number,
  patternsFound: number,
  guidance: string,
  principles: SearchResult[] = [],
  patterns: SearchResult[] = [],
  project?: string
) {
  try {
    db.insert(consultLog).values({
      decision,
      context: context || '',
      principlesFound,
      patternsFound,
      guidance: guidance.substring(0, 500),
      createdAt: Date.now(),
      project: project || null,
    }).run();

    // Comprehensive console logging
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[CONSULT] ${new Date().toISOString()}`);
    if (project) console.log(`  Project: ${project}`);
    console.log(`  Decision: "${decision}"`);
    if (context) console.log(`  Context: "${context}"`);
    console.log(`  Found: ${principlesFound} principles, ${patternsFound} patterns`);

    if (principles.length > 0) {
      console.log(`  Principles:`);
      principles.forEach((p, i) => {
        console.log(`    ${i + 1}. score=${p.score || 'N/A'} id=${p.id || 'N/A'}`);
        console.log(`       ${p.content?.substring(0, 80)}...`);
      });
    }

    if (patterns.length > 0) {
      console.log(`  Patterns:`);
      patterns.forEach((p, i) => {
        console.log(`    ${i + 1}. score=${p.score || 'N/A'} id=${p.id || 'N/A'}`);
        console.log(`       ${p.content?.substring(0, 80)}...`);
      });
    }

    // Log guidance summary
    console.log(`  Guidance Preview: ${guidance.substring(0, 100)}...`);

    // Log any unexpected data
    const allResults = [...principles, ...patterns];
    if (allResults.length > 0) {
      const expectedFields = ['id', 'content', 'source_file', 'source', 'score', 'type', 'concepts'];
      const unknownFields = new Set<string>();
      allResults.forEach(r => {
        Object.keys(r as unknown as Record<string, unknown>).forEach(k => {
          if (!expectedFields.includes(k)) unknownFields.add(k);
        });
      });
      if (unknownFields.size > 0) {
        console.log(`  [UNKNOWN FIELDS]: ${Array.from(unknownFields).join(', ')}`);
      }
    }
    console.log(`${'='.repeat(60)}\n`);
  } catch (e) {
    console.error('Failed to log consult:', e);
  }
}
