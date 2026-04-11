/**
 * Similar Handler
 *
 * Find similar documents by vector nearest neighbors.
 */

import { inArray } from 'drizzle-orm';
import { db, oracleDocuments } from '../../db/index.ts';
import { ensureVectorStoreConnected } from '../../vector/factory.ts';
import type { VectorStoreAdapter } from '../../vector/types.ts';
import type { SearchResult } from '../types.ts';

/**
 * Find similar documents by document ID (vector nearest neighbors)
 */
export async function handleSimilar(
  docId: string,
  limit: number = 5,
  model?: string
): Promise<{ results: SearchResult[]; docId: string }> {
  try {
    const client: VectorStoreAdapter = await ensureVectorStoreConnected(model);

    // Query by ID if supported
    if (!client.queryById) {
      throw new Error('Vector store does not support queryById');
    }

    const chromaResults = await client.queryById(docId, limit);

    if (!chromaResults.ids || chromaResults.ids.length === 0) {
      return { results: [], docId };
    }

    // Enrich with SQLite data (concepts, project)
    const rows = db.select({
      id: oracleDocuments.id,
      type: oracleDocuments.type,
      sourceFile: oracleDocuments.sourceFile,
      concepts: oracleDocuments.concepts,
      project: oracleDocuments.project
    })
      .from(oracleDocuments)
      .where(inArray(oracleDocuments.id, chromaResults.ids))
      .all();

    const docMap = new Map(rows.map(r => [r.id, r]));

    const results: SearchResult[] = chromaResults.ids.map((id: string, i: number) => {
      const distance = chromaResults.distances?.[i] || 1;
      const similarity = Math.max(0, 1 - distance / 2);
      const doc = docMap.get(id);

      return {
        id,
        type: doc?.type || chromaResults.metadatas?.[i]?.type || 'unknown',
        content: chromaResults.documents?.[i] || '',
        source_file: doc?.sourceFile || chromaResults.metadatas?.[i]?.source_file || '',
        concepts: doc?.concepts ? JSON.parse(doc.concepts) : [],
        project: doc?.project,
        source: 'vector' as const,
        score: similarity
      };
    });

    return { results, docId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Similar Search Error]', msg);
    throw new Error(`Similar search failed: ${msg}`);
  }
}
