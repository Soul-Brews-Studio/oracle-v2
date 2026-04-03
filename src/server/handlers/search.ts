/**
 * Search Handlers
 *
 * Hybrid search (FTS5 + Vector) with project filtering and model selection.
 */

import { eq, sql, or } from 'drizzle-orm';
import { db, sqlite, oracleDocuments } from '../../db/index.ts';
import { logSearch, logDocumentAccess } from '../logging.ts';
import type { SearchResult, SearchResponse } from '../types.ts';
import { ensureVectorStoreConnected } from '../../vector/factory.ts';
import type { VectorStoreAdapter } from '../../vector/types.ts';
import { detectProject } from '../project-detect.ts';

/**
 * Normalize FTS5 rank to 0-1 score
 */
function normalizeRank(rank: number): number {
  // FTS5 rank is negative (more negative = better match)
  // Convert to positive 0-1 score
  return Math.min(1, Math.max(0, 1 / (1 + Math.abs(rank))));
}

/**
 * Combine FTS and vector results with hybrid scoring
 */
function combineSearchResults(fts: SearchResult[], vector: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();

  // Add FTS results first
  for (const r of fts) {
    seen.set(r.id, r);
  }

  // Merge vector results (boost score if found in both)
  for (const r of vector) {
    if (seen.has(r.id)) {
      const existing = seen.get(r.id)!;
      // Use max score + bonus for appearing in both (hybrid boost)
      const maxScore = Math.max(existing.score || 0, r.score || 0);
      const bonus = 0.1; // Bonus for appearing in both FTS and vector
      seen.set(r.id, {
        ...existing,
        score: Math.min(1, maxScore + bonus), // Cap at 1.0
        source: 'hybrid' as const,
        distance: r.distance,
        model: r.model
      });
    } else {
      seen.set(r.id, r);
    }
  }

  // Sort by score descending
  return Array.from(seen.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Get vector store for model
 */
async function getVectorStore(model?: string): Promise<VectorStoreAdapter> {
  return ensureVectorStoreConnected(model);
}

/**
 * Search Oracle knowledge base with hybrid search (FTS5 + Vector)
 */
export async function handleSearch(
  query: string,
  type: string = 'all',
  limit: number = 10,
  offset: number = 0,
  mode: 'hybrid' | 'fts' | 'vector' = 'hybrid',
  project?: string,
  cwd?: string,
  model?: string
): Promise<SearchResponse & { mode?: string; warning?: string; model?: string }> {
  // Auto-detect project from cwd if not explicitly specified
  const resolvedProject = (project ?? detectProject(cwd))?.toLowerCase() ?? null;
  const startTime = Date.now();

  // Remove FTS5 special characters and HTML
  const safeQuery = query
    .replace(/<[^>]*>/g, ' ')           // Strip HTML tags
    .replace(/[?*+\-()^~"':;<>{}[\]\\\/]/g, ' ')  // Strip FTS5 + SQL special chars
    .replace(/\s+/g, ' ')
    .trim();

  if (!safeQuery) {
    return { results: [], total: 0, limit, offset, query };
  }

  let warning: string | undefined;

  // FTS5 search
  let ftsResults: SearchResult[] = [];
  let ftsTotal = 0;

  // Project filter
  const projectFilter = resolvedProject
    ? '(d.project = ? OR d.project IS NULL)'
    : '1=1';
  const projectParams = resolvedProject ? [resolvedProject] : [];

  if (mode !== 'vector') {
    if (type === 'all') {
      const countStmt = sqlite.prepare(`
        SELECT COUNT(*) as total
        FROM oracle_fts f
        JOIN oracle_documents d ON f.id = d.id
        WHERE oracle_fts MATCH ? AND ${projectFilter}
      `);
      ftsTotal = (countStmt.get(safeQuery, ...projectParams) as { total: number }).total;

      const stmt = sqlite.prepare(`
        SELECT f.id, f.content, d.type, d.source_file, d.concepts, d.project, rank as score
        FROM oracle_fts f
        JOIN oracle_documents d ON f.id = d.id
        WHERE oracle_fts MATCH ? AND ${projectFilter}
        ORDER BY rank
        LIMIT ?
      `);
      ftsResults = stmt.all(safeQuery, ...projectParams, limit * 2).map((row: any) => ({
        id: row.id,
        type: row.type,
        content: row.content,
        source_file: row.source_file,
        concepts: JSON.parse(row.concepts || '[]'),
        project: row.project,
        source: 'fts' as const,
        score: normalizeRank(row.score)
      }));
    } else {
      const countStmt = sqlite.prepare(`
        SELECT COUNT(*) as total
        FROM oracle_fts f
        JOIN oracle_documents d ON f.id = d.id
        WHERE oracle_fts MATCH ? AND d.type = ? AND ${projectFilter}
      `);
      ftsTotal = (countStmt.get(safeQuery, type, ...projectParams) as { total: number }).total;

      const stmt = sqlite.prepare(`
        SELECT f.id, f.content, d.type, d.source_file, d.concepts, d.project, rank as score
        FROM oracle_fts f
        JOIN oracle_documents d ON f.id = d.id
        WHERE oracle_fts MATCH ? AND d.type = ? AND ${projectFilter}
        ORDER BY rank
        LIMIT ?
      `);
      ftsResults = stmt.all(safeQuery, type, ...projectParams, limit * 2).map((row: any) => ({
        id: row.id,
        type: row.type,
        content: row.content,
        source_file: row.source_file,
        concepts: JSON.parse(row.concepts || '[]'),
        project: row.project,
        source: 'fts' as const,
        score: normalizeRank(row.score)
      }));
    }
  }

  // Vector search
  let vectorResults: SearchResult[] = [];
  let vectorTotal = 0;

  if (mode !== 'fts') {
    const vectorStore = await getVectorStore(model);
    if (vectorStore.status === 'connected') {
      const vectorQuery = type === 'all' ? safeQuery : `${type} ${safeQuery}`;
      const { results, total } = await vectorStore.search(vectorQuery, limit * 2, 0);

      vectorResults = results
        .filter((r: any) => !resolvedProject || !r.project || r.project.toLowerCase() === resolvedProject)
        .map((r: any) => ({
          id: r.id,
          type: r.type,
          content: r.text,
          source_file: r.source_file,
          concepts: r.concepts || [],
          project: r.project,
          source: 'vector' as const,
          score: r.score,
          distance: r._distance,
          model
        }));

      vectorTotal = total;
    } else if (mode === 'vector') {
      warning = 'Vector store not connected';
    }
  }

  // Combine results
  const combined = combineSearchResults(ftsResults, vectorResults);
  let total = Math.max(ftsTotal, combined.length);

  if (mode === 'vector' && vectorResults.length > 0) {
    total = vectorTotal;
  }

  const results = combined.slice(offset, offset + limit);
  const searchTime = Date.now() - startTime;

  logSearch(query, type, mode, total, searchTime, results);
  results.forEach(r => logDocumentAccess(r.id, 'search'));

  return {
    results,
    total,
    limit,
    offset,
    query,
    mode,
    model,
    warning
  };
}
