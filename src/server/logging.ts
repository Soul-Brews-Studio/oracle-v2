/**
 * Oracle v2 Logging Functions
 */

import { db } from './db.js';
import type { SearchResult } from './types.js';

/**
 * Log search query with full details
 */
export function logSearch(
  query: string,
  type: string,
  mode: string,
  resultsCount: number,
  searchTimeMs: number,
  results: SearchResult[] = []
) {
  try {
    db.prepare(`
      INSERT INTO search_log (query, type, mode, results_count, search_time_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(query, type, mode, resultsCount, searchTimeMs, Date.now());

    // Comprehensive console logging
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[SEARCH] ${new Date().toISOString()}`);
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
export function logDocumentAccess(documentId: string, accessType: string) {
  try {
    db.prepare(`
      INSERT INTO document_access (document_id, access_type, created_at)
      VALUES (?, ?, ?)
    `).run(documentId, accessType, Date.now());
  } catch (e) {
    console.error('Failed to log access:', e);
  }
}

/**
 * Log learning addition
 */
export function logLearning(documentId: string, patternPreview: string, source: string, concepts: string[]) {
  try {
    db.prepare(`
      INSERT INTO learn_log (document_id, pattern_preview, source, concepts, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(documentId, patternPreview.substring(0, 100), source || 'Oracle Learn', JSON.stringify(concepts), Date.now());
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
  patterns: SearchResult[] = []
) {
  try {
    db.prepare(`
      INSERT INTO consult_log (decision, context, principles_found, patterns_found, guidance, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(decision, context || '', principlesFound, patternsFound, guidance.substring(0, 500), Date.now());

    // Comprehensive console logging
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[CONSULT] ${new Date().toISOString()}`);
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
