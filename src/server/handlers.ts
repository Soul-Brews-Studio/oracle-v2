/**
 * Oracle v2 Core Request Handlers
 *
 * Partially migrated to Drizzle ORM. FTS5 operations remain as raw SQL
 * since Drizzle doesn't support virtual tables.
 */

import fs from 'fs';
import path from 'path';
import { eq, sql, or, inArray } from 'drizzle-orm';
import { db, sqlite, oracleDocuments, indexingStatus } from '../db/index.js';
import { REPO_ROOT } from './db.js';
import { logSearch, logDocumentAccess, logLearning, logConsult } from './logging.js';
import type { SearchResult, SearchResponse } from './types.js';
import { ChromaMcpClient } from '../chroma-mcp.js';
import { detectProject } from './project-detect.js';

// Singleton ChromaMcpClient for vector search
// HTTP server can use this because it's NOT an MCP server (no stdio conflict)
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/tmp';
const CHROMA_PATH = path.join(HOME_DIR, '.chromadb');
let chromaClient: ChromaMcpClient | null = null;

function getChromaClient(): ChromaMcpClient {
  if (!chromaClient) {
    chromaClient = new ChromaMcpClient('oracle_knowledge', CHROMA_PATH, '3.12');
  }
  return chromaClient;
}

/**
 * Search Oracle knowledge base with hybrid search (FTS5 + Vector)
 * HTTP server can safely use ChromaMcpClient since it's not an MCP server
 */
export async function handleSearch(
  query: string,
  type: string = 'all',
  limit: number = 10,
  offset: number = 0,
  mode: 'hybrid' | 'fts' | 'vector' = 'hybrid',
  project?: string,  // If set: project + universal. If null/undefined: universal only
  cwd?: string       // Auto-detect project from cwd if project not specified
): Promise<SearchResponse & { mode?: string; warning?: string }> {
  // Auto-detect project from cwd if not explicitly specified
  const resolvedProject = project ?? detectProject(cwd);
  const startTime = Date.now();
  // Remove FTS5 special characters: ? * + - ( ) ^ ~ " ' : (colon is column prefix)
  const safeQuery = query.replace(/[?*+\-()^~"':]/g, ' ').replace(/\s+/g, ' ').trim();

  let warning: string | undefined;

  // FTS5 search (skip if vector-only mode)
  let ftsResults: SearchResult[] = [];
  let ftsTotal = 0;

  // Project filter: if project specified, include project + universal (NULL)
  // If no project, return ALL documents (no filter)
  const projectFilter = resolvedProject
    ? '(d.project = ? OR d.project IS NULL)'
    : '1=1';
  const projectParams = resolvedProject ? [resolvedProject] : [];

  // FTS5 search must use raw SQL (Drizzle doesn't support virtual tables)
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

  // Vector search (skip if fts-only mode)
  let vectorResults: SearchResult[] = [];

  if (mode !== 'fts') {
    try {
      console.log(`[Hybrid] Starting vector search for: "${query.substring(0, 30)}..."`);
      const client = getChromaClient();
      const whereFilter = type !== 'all' ? { type } : undefined;
      const chromaResults = await client.query(query, limit * 2, whereFilter);

      console.log(`[Hybrid] Vector returned ${chromaResults.ids?.length || 0} results`);
      console.log(`[Hybrid] First 3 distances: ${chromaResults.distances?.slice(0, 3)}`);

      if (chromaResults.ids && chromaResults.ids.length > 0) {
        // Get project metadata for vector results using Drizzle
        const rows = db.select({ id: oracleDocuments.id, project: oracleDocuments.project })
          .from(oracleDocuments)
          .where(inArray(oracleDocuments.id, chromaResults.ids))
          .all();
        const projectMap = new Map<string, string | null>();
        rows.forEach(r => projectMap.set(r.id, r.project));

        vectorResults = chromaResults.ids
          .map((id: string, i: number) => {
            // Cosine distance: 0=identical, 1=orthogonal, 2=opposite
            // Convert to similarity: 0.5=orthogonal, 1=identical, 0=opposite
            const distance = chromaResults.distances?.[i] || 1;
            const similarity = Math.max(0, 1 - distance / 2);
            const docProject = projectMap.get(id);
            return {
              id,
              type: chromaResults.metadatas?.[i]?.type || 'unknown',
              content: chromaResults.documents?.[i] || '',
              source_file: chromaResults.metadatas?.[i]?.source_file || '',
              concepts: [],
              project: docProject,
              source: 'vector' as const,
              score: similarity
            };
          })
          // Filter by project: include if project matches OR is universal (null)
          .filter(r => {
            if (!resolvedProject) {
              // No project filter: only return universal
              return r.project === null;
            }
            // With project: return project-specific + universal
            return r.project === resolvedProject || r.project === null;
          });
        console.log(`[Hybrid] Mapped ${vectorResults.length} vector results (after project filter), scores: ${vectorResults.slice(0, 3).map(r => r.score?.toFixed(3))}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[Vector Search Error]', msg);
      warning = `Vector search unavailable: ${msg}. Using FTS5 only.`;
    }
  }

  // Combine results using hybrid ranking
  const combined = combineSearchResults(ftsResults, vectorResults);
  const total = Math.max(ftsTotal, combined.length);

  // Apply pagination
  const results = combined.slice(offset, offset + limit);

  // Log search
  const searchTime = Date.now() - startTime;
  logSearch(query, type, mode, total, searchTime, results);
  results.forEach(r => logDocumentAccess(r.id, 'search'));

  return {
    results,
    total,
    offset,
    limit,
    mode,
    ...(warning && { warning })
  };
}

/**
 * Normalize FTS5 rank score to 0-1 range (higher = better)
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
        source: 'hybrid' as const
      });
    } else {
      seen.set(r.id, r);
    }
  }

  // Sort by score descending
  return Array.from(seen.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Synthesize guidance from principles and patterns
 */
export function synthesizeGuidance(decision: string, principles: any[], patterns: any[]): string {
  let guidance = 'Based on Oracle philosophy:\n\n';

  if (principles.length > 0) {
    guidance += 'Relevant Principles:\n';
    principles.forEach((p: any, i: number) => {
      guidance += `${i + 1}. ${p.content.substring(0, 150)}...\n`;
    });
    guidance += '\n';
  }

  if (patterns.length > 0) {
    guidance += 'Relevant Patterns:\n';
    patterns.forEach((p: any, i: number) => {
      guidance += `${i + 1}. ${p.content.substring(0, 150)}...\n`;
    });
  }

  if (principles.length === 0 && patterns.length === 0) {
    guidance += `No matching principles or patterns for: "${decision}"`;
  } else {
    guidance += '\nRemember: The Oracle Keeps the Human Human.';
  }

  return guidance;
}

/**
 * Get guidance on a decision (always hybrid: FTS + vector)
 */
export async function handleConsult(decision: string, context: string = '') {
  const query = context ? `${decision} ${context}` : decision;
  // Remove FTS5 special characters: ? * + - ( ) ^ ~ " ' : (colon is column prefix)
  const safeQuery = query.replace(/[?*+\-()^~"':]/g, ' ').replace(/\s+/g, ' ').trim();

  // Run FTS search (must use raw SQL - Drizzle doesn't support FTS5)
  const principleStmt = sqlite.prepare(`
    SELECT f.id, f.content, d.source_file, rank as score
    FROM oracle_fts f
    JOIN oracle_documents d ON f.id = d.id
    WHERE oracle_fts MATCH ? AND d.type = 'principle'
    ORDER BY rank
    LIMIT 5
  `);
  const ftsPrinciples = principleStmt.all(safeQuery).map((row: any) => ({
    ...row,
    score: normalizeRank(row.score),
    source: 'fts' as const
  }));

  const learningStmt = sqlite.prepare(`
    SELECT f.id, f.content, d.source_file, rank as score
    FROM oracle_fts f
    JOIN oracle_documents d ON f.id = d.id
    WHERE oracle_fts MATCH ? AND d.type = 'learning'
    ORDER BY rank
    LIMIT 5
  `);
  const ftsPatterns = learningStmt.all(safeQuery).map((row: any) => ({
    ...row,
    score: normalizeRank(row.score),
    source: 'fts' as const
  }));

  // Run vector search (always, not just fallback)
  let vectorPrinciples: any[] = [];
  let vectorPatterns: any[] = [];

  try {
    const client = getChromaClient();
    console.log('[Consult] Hybrid search for:', query);

    const vectorResults = await client.query(query, 15);
    console.log('[Consult] Vector returned:', vectorResults.ids?.length || 0, 'results');

    if (vectorResults.ids?.length > 0) {
      for (let i = 0; i < vectorResults.ids.length; i++) {
        const docType = vectorResults.metadatas?.[i]?.type;
        const distance = vectorResults.distances?.[i] || 1;
        const similarity = Math.max(0, 1 - distance / 2);

        const doc = {
          id: vectorResults.ids[i],
          content: vectorResults.documents?.[i] || '',
          source_file: vectorResults.metadatas?.[i]?.source_file || '',
          score: similarity,
          source: 'vector' as const
        };

        if (docType === 'principle' && vectorPrinciples.length < 5) {
          vectorPrinciples.push(doc);
        } else if (docType === 'learning' && vectorPatterns.length < 5) {
          vectorPatterns.push(doc);
        }
      }
    }
  } catch (error) {
    console.error('[Consult Vector Search Error]', error);
  }

  // Merge FTS and vector results (dedupe by id, boost score if in both)
  const principlesRaw = mergeConsultResults(ftsPrinciples, vectorPrinciples, 3);
  const patternsRaw = mergeConsultResults(ftsPatterns, vectorPatterns, 3);

  console.log('[Consult] Final:', principlesRaw.length, 'principles,', patternsRaw.length, 'patterns');

  const guidance = synthesizeGuidance(decision, principlesRaw, patternsRaw);

  // Log the consultation with full details
  logConsult(decision, context, principlesRaw.length, patternsRaw.length, guidance, principlesRaw, patternsRaw);

  return {
    decision,
    principles: principlesRaw.map((p: any) => ({
      id: p.id,
      content: p.content.substring(0, 300),
      source_file: p.source_file,
      score: p.score,
      source: p.source
    })),
    patterns: patternsRaw.map((p: any) => ({
      id: p.id,
      content: p.content.substring(0, 300),
      source_file: p.source_file,
      score: p.score,
      source: p.source
    })),
    guidance
  };
}

/**
 * Merge FTS and vector results for consult (dedupe, boost, limit)
 */
function mergeConsultResults(fts: any[], vector: any[], limit: number): any[] {
  const seen = new Map<string, any>();

  // Add FTS results
  for (const r of fts) {
    seen.set(r.id, r);
  }

  // Merge vector results
  for (const r of vector) {
    if (seen.has(r.id)) {
      const existing = seen.get(r.id)!;
      // Boost for appearing in both
      const maxScore = Math.max(existing.score || 0, r.score || 0);
      seen.set(r.id, {
        ...existing,
        score: Math.min(1, maxScore + 0.1),
        source: 'hybrid'
      });
    } else {
      seen.set(r.id, r);
    }
  }

  // Sort by score and limit
  return Array.from(seen.values())
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
}

/**
 * Get random wisdom
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
  `).get(randomDoc.id) as { content: string };

  return {
    id: randomDoc.id,
    type: randomDoc.type,
    content: content.content,
    source_file: randomDoc.sourceFile,
    concepts: JSON.parse(randomDoc.concepts || '[]')
  };
}

/**
 * List all documents (browse without search)
 * @param groupByFile - if true, dedupe by source_file (show one entry per file)
 *
 * Note: Uses raw SQL for FTS JOIN since Drizzle doesn't support virtual tables.
 * Count queries use Drizzle where possible.
 */
export function handleList(type: string = 'all', limit: number = 10, offset: number = 0, groupByFile: boolean = true): SearchResponse {
  // Validate
  if (limit < 1 || limit > 100) limit = 10;
  if (offset < 0) offset = 0;

  if (groupByFile) {
    // Group by source_file to avoid duplicate entries from same file
    if (type === 'all') {
      // Count distinct files using Drizzle
      const countResult = db.select({ total: sql<number>`count(distinct ${oracleDocuments.sourceFile})` })
        .from(oracleDocuments)
        .get();
      const total = countResult?.total || 0;

      // Need raw SQL for FTS JOIN with GROUP BY
      const stmt = sqlite.prepare(`
        SELECT d.id, d.type, d.source_file, d.concepts, d.project, MAX(d.indexed_at) as indexed_at, f.content
        FROM oracle_documents d
        JOIN oracle_fts f ON d.id = f.id
        GROUP BY d.source_file
        ORDER BY indexed_at DESC
        LIMIT ? OFFSET ?
      `);
      const results = stmt.all(limit, offset).map((row: any) => ({
        id: row.id,
        type: row.type,
        content: row.content || '',
        source_file: row.source_file,
        concepts: row.concepts ? JSON.parse(row.concepts) : [],
        project: row.project,
        indexed_at: row.indexed_at
      }));

      return { results, total, offset, limit };
    } else {
      // Count distinct files for type using Drizzle
      const countResult = db.select({ total: sql<number>`count(distinct ${oracleDocuments.sourceFile})` })
        .from(oracleDocuments)
        .where(eq(oracleDocuments.type, type))
        .get();
      const total = countResult?.total || 0;

      // Need raw SQL for FTS JOIN with GROUP BY
      const stmt = sqlite.prepare(`
        SELECT d.id, d.type, d.source_file, d.concepts, d.project, MAX(d.indexed_at) as indexed_at, f.content
        FROM oracle_documents d
        JOIN oracle_fts f ON d.id = f.id
        WHERE d.type = ?
        GROUP BY d.source_file
        ORDER BY indexed_at DESC
        LIMIT ? OFFSET ?
      `);
      const results = stmt.all(type, limit, offset).map((row: any) => ({
        id: row.id,
        type: row.type,
        content: row.content || '',
        source_file: row.source_file,
        concepts: JSON.parse(row.concepts || '[]'),
        project: row.project,
        indexed_at: row.indexed_at
      }));

      return { results, total, offset, limit };
    }
  }

  // Original behavior without grouping
  if (type === 'all') {
    // Count using Drizzle
    const countResult = db.select({ total: sql<number>`count(*)` })
      .from(oracleDocuments)
      .get();
    const total = countResult?.total || 0;

    // Need raw SQL for FTS JOIN
    const stmt = sqlite.prepare(`
      SELECT d.id, d.type, d.source_file, d.concepts, d.project, d.indexed_at, f.content
      FROM oracle_documents d
      JOIN oracle_fts f ON d.id = f.id
      ORDER BY d.indexed_at DESC
      LIMIT ? OFFSET ?
    `);
    const results = stmt.all(limit, offset).map((row: any) => ({
      id: row.id,
      type: row.type,
      content: row.content || '',
      source_file: row.source_file,
      concepts: row.concepts ? JSON.parse(row.concepts) : [],
      project: row.project,
      indexed_at: row.indexed_at
    }));

    return { results, total, offset, limit };
  } else {
    // Count using Drizzle
    const countResult = db.select({ total: sql<number>`count(*)` })
      .from(oracleDocuments)
      .where(eq(oracleDocuments.type, type))
      .get();
    const total = countResult?.total || 0;

    // Need raw SQL for FTS JOIN
    const stmt = sqlite.prepare(`
      SELECT d.id, d.type, d.source_file, d.concepts, d.project, d.indexed_at, f.content
      FROM oracle_documents d
      JOIN oracle_fts f ON d.id = f.id
      WHERE d.type = ?
      ORDER BY d.indexed_at DESC
      LIMIT ? OFFSET ?
    `);
    const results = stmt.all(type, limit, offset).map((row: any) => ({
      id: row.id,
      type: row.type,
      content: row.content,
      source_file: row.source_file,
      concepts: JSON.parse(row.concepts || '[]'),
      project: row.project,
      indexed_at: row.indexed_at
    }));

    return { results, total, offset, limit };
  }
}

/**
 * Get database statistics
 */
export function handleStats(dbPath: string) {
  // Total documents using Drizzle
  const totalDocsResult = db.select({ count: sql<number>`count(*)` })
    .from(oracleDocuments)
    .get();
  const totalDocs = totalDocsResult?.count || 0;

  // Count by type using Drizzle
  const byTypeResults = db.select({
    type: oracleDocuments.type,
    count: sql<number>`count(*)`
  })
    .from(oracleDocuments)
    .groupBy(oracleDocuments.type)
    .all();

  // Get last indexed timestamp using Drizzle
  const lastIndexedResult = db.select({ lastIndexed: sql<number | null>`max(${oracleDocuments.indexedAt})` })
    .from(oracleDocuments)
    .get();

  const lastIndexedDate = lastIndexedResult?.lastIndexed
    ? new Date(lastIndexedResult.lastIndexed).toISOString()
    : null;

  // Calculate age in hours
  const indexAgeHours = lastIndexedResult?.lastIndexed
    ? (Date.now() - lastIndexedResult.lastIndexed) / (1000 * 60 * 60)
    : null;

  // Get indexing status using Drizzle
  let idxStatus = { is_indexing: false, progress_current: 0, progress_total: 0, completed_at: null as number | null };
  try {
    const status = db.select({
      isIndexing: indexingStatus.isIndexing,
      progressCurrent: indexingStatus.progressCurrent,
      progressTotal: indexingStatus.progressTotal,
      completedAt: indexingStatus.completedAt
    })
      .from(indexingStatus)
      .where(eq(indexingStatus.id, 1))
      .get();

    if (status) {
      idxStatus = {
        is_indexing: status.isIndexing === 1,
        progress_current: status.progressCurrent || 0,
        progress_total: status.progressTotal || 0,
        completed_at: status.completedAt
      };
    }
  } catch (e) {
    // Table doesn't exist yet, use defaults
  }

  return {
    total: totalDocs,
    by_type: byTypeResults.reduce((acc, row) => ({ ...acc, [row.type]: row.count }), {}),
    last_indexed: lastIndexedDate,
    index_age_hours: indexAgeHours ? Math.round(indexAgeHours * 10) / 10 : null,
    is_stale: indexAgeHours ? indexAgeHours > 24 : true,
    is_indexing: idxStatus.is_indexing,
    indexing_progress: idxStatus.is_indexing ? {
      current: idxStatus.progress_current,
      total: idxStatus.progress_total,
      percent: idxStatus.progress_total > 0
        ? Math.round((idxStatus.progress_current / idxStatus.progress_total) * 100)
        : 0
    } : null,
    indexing_completed_at: idxStatus.completed_at,
    database: dbPath
  };
}

/**
 * Get knowledge graph data
 * Limited to principles + sample learnings to avoid O(n²) explosion
 */
export function handleGraph() {
  // Only get principles (always) + sample learnings (limited)
  // This keeps graph manageable: ~163 principles + ~100 learnings = ~263 nodes max

  // Get all principles using Drizzle
  const principles = db.select({
    id: oracleDocuments.id,
    type: oracleDocuments.type,
    sourceFile: oracleDocuments.sourceFile,
    concepts: oracleDocuments.concepts,
    project: oracleDocuments.project
  })
    .from(oracleDocuments)
    .where(eq(oracleDocuments.type, 'principle'))
    .all();

  // Get random learnings using Drizzle
  const learnings = db.select({
    id: oracleDocuments.id,
    type: oracleDocuments.type,
    sourceFile: oracleDocuments.sourceFile,
    concepts: oracleDocuments.concepts,
    project: oracleDocuments.project
  })
    .from(oracleDocuments)
    .where(eq(oracleDocuments.type, 'learning'))
    .orderBy(sql`RANDOM()`)
    .limit(100)
    .all();

  const docs = [...principles, ...learnings];

  // Build nodes
  const nodes = docs.map(doc => ({
    id: doc.id,
    type: doc.type,
    source_file: doc.sourceFile,
    project: doc.project,  // ghq-style path for cross-repo file access
    concepts: JSON.parse(doc.concepts || '[]')
  }));

  // Build links based on shared concepts
  const links: { source: string; target: string; weight: number }[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];
      const key = `${nodeA.id}-${nodeB.id}`;

      if (processed.has(key)) continue;

      // Count shared concepts
      const conceptsA = new Set(nodeA.concepts);
      const sharedCount = nodeB.concepts.filter((c: string) => conceptsA.has(c)).length;

      if (sharedCount > 0) {
        links.push({
          source: nodeA.id,
          target: nodeB.id,
          weight: sharedCount
        });
        processed.add(key);
      }
    }
  }

  return { nodes, links };
}

/**
 * Add new pattern/learning to knowledge base
 * @param origin - 'mother' | 'arthur' | 'volt' | 'human' (null = universal)
 * @param project - ghq-style project path (null = universal)
 * @param cwd - Auto-detect project from cwd if project not specified
 */
export function handleLearn(
  pattern: string,
  source?: string,
  concepts?: string[],
  origin?: string,
  project?: string,
  cwd?: string
) {
  // Auto-detect project from cwd if not explicitly specified
  const resolvedProject = project ?? detectProject(cwd);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Generate slug from pattern (first 50 chars, alphanumeric + dash)
  const slug = pattern
    .substring(0, 50)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const filename = `${dateStr}_${slug}.md`;
  const filePath = path.join(REPO_ROOT, 'ψ/memory/learnings', filename);

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    throw new Error(`File already exists: ${filename}`);
  }

  // Generate title from pattern
  const title = pattern.split('\n')[0].substring(0, 80);

  // Create frontmatter
  const frontmatter = [
    '---',
    `title: ${title}`,
    concepts && concepts.length > 0 ? `tags: [${concepts.join(', ')}]` : 'tags: []',
    `created: ${dateStr}`,
    `source: ${source || 'Oracle Learn'}`,
    '---',
    '',
    `# ${title}`,
    '',
    pattern,
    '',
    '---',
    '*Added via Oracle Learn*',
    ''
  ].join('\n');

  // Write file
  fs.writeFileSync(filePath, frontmatter, 'utf-8');

  // Re-index the new file
  const content = frontmatter;
  const id = `learning_${dateStr}_${slug}`;
  const conceptsList = concepts || [];

  // Insert into database with provenance using Drizzle
  db.insert(oracleDocuments).values({
    id,
    type: 'learning',
    sourceFile: `ψ/memory/learnings/${filename}`,
    concepts: JSON.stringify(conceptsList),
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
    indexedAt: now.getTime(),
    origin: origin || null,          // origin: null = universal/mother
    project: resolvedProject || null, // project: null = universal (auto-detected from cwd)
    createdBy: 'oracle_learn'
  }).run();

  // Insert into FTS (must use raw SQL - Drizzle doesn't support virtual tables)
  sqlite.prepare(`
    INSERT INTO oracle_fts (id, content, concepts)
    VALUES (?, ?, ?)
  `).run(
    id,
    content,
    conceptsList.join(' ')
  );

  // Log the learning
  logLearning(id, pattern, source || 'Oracle Learn', conceptsList);

  return {
    success: true,
    file: `ψ/memory/learnings/${filename}`,
    id
  };
}
