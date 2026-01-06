/**
 * Oracle v2 Unit Tests
 *
 * Tests for core Oracle functionality:
 * - FTS5 score normalization
 * - Result combination (hybrid search)
 * - Query sanitization
 * - Concept parsing
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Test Utilities - Extracted functions for testing
// ============================================================================

/**
 * Normalize FTS5 rank score
 * FTS5 rank is negative, lower = better match
 * Converts to 0-1 scale where higher = better
 */
function normalizeFtsScore(rank: number): number {
  return 1 / (1 + Math.abs(rank));
}

/**
 * Improved FTS5 score normalization using exponential decay
 * Better separation for top results
 */
function normalizeFtsScoreImproved(rank: number): number {
  const absRank = Math.abs(rank);
  return Math.exp(-0.3 * absRank);
}

/**
 * Sanitize FTS5 query to prevent parse errors
 * Includes: ? * + - ( ) ^ ~ " ' : . / (all can cause FTS5 syntax errors)
 */
function sanitizeFtsQuery(query: string): string {
  // Remove/escape FTS5 special characters
  let sanitized = query
    .replace(/[?*+\-()^~"':.\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    return query; // Return original if sanitization empties it
  }

  return sanitized;
}

/**
 * Parse concepts from metadata (JSON string or array)
 */
function parseConceptsFromMetadata(concepts: unknown): string[] {
  if (!concepts) return [];
  if (Array.isArray(concepts)) return concepts.filter(c => typeof c === 'string');
  if (typeof concepts === 'string') {
    try {
      const parsed = JSON.parse(concepts);
      if (Array.isArray(parsed)) return parsed.filter(c => typeof c === 'string');
    } catch {
      // Try comma-separated
      return concepts.split(',').map(c => c.trim()).filter(Boolean);
    }
  }
  return [];
}

/**
 * Combine FTS and vector search results
 */
function combineResults(
  ftsResults: Array<{
    id: string;
    type: string;
    content: string;
    source_file: string;
    concepts: string[];
    score: number;
    source: 'fts';
  }>,
  vectorResults: Array<{
    id: string;
    type: string;
    content: string;
    source_file: string;
    concepts: string[];
    score: number;
    source: 'vector';
  }>,
  ftsWeight: number = 0.5,
  vectorWeight: number = 0.5
): Array<{
  id: string;
  type: string;
  content: string;
  source_file: string;
  concepts: string[];
  score: number;
  source: 'fts' | 'vector' | 'hybrid';
  ftsScore?: number;
  vectorScore?: number;
}> {
  const resultMap = new Map<string, {
    id: string;
    type: string;
    content: string;
    source_file: string;
    concepts: string[];
    ftsScore?: number;
    vectorScore?: number;
    source: 'fts' | 'vector' | 'hybrid';
  }>();

  // Add FTS results
  for (const result of ftsResults) {
    resultMap.set(result.id, {
      id: result.id,
      type: result.type,
      content: result.content,
      source_file: result.source_file,
      concepts: result.concepts,
      ftsScore: result.score,
      source: 'fts',
    });
  }

  // Add/merge vector results
  for (const result of vectorResults) {
    const existing = resultMap.get(result.id);
    if (existing) {
      existing.vectorScore = result.score;
      existing.source = 'hybrid';
    } else {
      resultMap.set(result.id, {
        id: result.id,
        type: result.type,
        content: result.content,
        source_file: result.source_file,
        concepts: result.concepts,
        vectorScore: result.score,
        source: 'vector',
      });
    }
  }

  // Calculate hybrid scores
  const combined = Array.from(resultMap.values()).map((result) => {
    let score: number;

    if (result.source === 'hybrid') {
      const fts = result.ftsScore ?? 0;
      const vec = result.vectorScore ?? 0;
      score = ((ftsWeight * fts) + (vectorWeight * vec)) * 1.1;
    } else if (result.source === 'fts') {
      score = (result.ftsScore ?? 0) * ftsWeight;
    } else {
      score = (result.vectorScore ?? 0) * vectorWeight;
    }

    return {
      id: result.id,
      type: result.type,
      content: result.content,
      source_file: result.source_file,
      concepts: result.concepts,
      score,
      source: result.source,
      ftsScore: result.ftsScore,
      vectorScore: result.vectorScore,
    };
  });

  combined.sort((a, b) => b.score - a.score);
  return combined;
}

/**
 * Calculate query-aware weights for hybrid search
 */
function getQueryWeights(query: string): { fts: number; vector: number } {
  const words = query.toLowerCase().split(/\s+/);
  const hasQuotes = query.includes('"');
  const hasPhrases = words.length > 5;
  const hasBoolean = /\b(AND|OR|NOT)\b/i.test(query);

  // Short, exact queries favor FTS
  if (words.length <= 2 && !hasPhrases) {
    return { fts: 0.7, vector: 0.3 };
  }

  // Phrase/boolean queries favor FTS
  if (hasQuotes || hasBoolean) {
    return { fts: 0.75, vector: 0.25 };
  }

  // Long, semantic queries favor vector
  if (hasPhrases) {
    return { fts: 0.3, vector: 0.7 };
  }

  // Default: balanced
  return { fts: 0.5, vector: 0.5 };
}

// ============================================================================
// Unit Tests
// ============================================================================

describe('FTS5 Score Normalization', () => {
  it('should convert negative FTS5 rank to positive score', () => {
    expect(normalizeFtsScore(-1)).toBeCloseTo(0.5);
    expect(normalizeFtsScore(-2)).toBeCloseTo(0.333, 2);
    expect(normalizeFtsScore(-5)).toBeCloseTo(0.167, 2);
  });

  it('should handle zero rank', () => {
    expect(normalizeFtsScore(0)).toBe(1);
  });

  it('should return values between 0 and 1', () => {
    for (let i = -100; i <= 0; i++) {
      const score = normalizeFtsScore(i);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('should give better scores (higher) for better ranks (closer to 0)', () => {
    expect(normalizeFtsScore(-1)).toBeGreaterThan(normalizeFtsScore(-5));
    expect(normalizeFtsScore(-5)).toBeGreaterThan(normalizeFtsScore(-10));
  });
});

describe('Improved FTS5 Score Normalization (Exponential)', () => {
  it('should provide better separation for top results', () => {
    const oldDiff = normalizeFtsScore(-1) - normalizeFtsScore(-3);
    const newDiff = normalizeFtsScoreImproved(-1) - normalizeFtsScoreImproved(-3);
    expect(newDiff).toBeGreaterThan(oldDiff);
  });

  it('should return values between 0 and 1', () => {
    for (let i = -100; i <= 0; i++) {
      const score = normalizeFtsScoreImproved(i);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('should give exponential decay', () => {
    const score1 = normalizeFtsScoreImproved(-1);
    const score2 = normalizeFtsScoreImproved(-2);
    const score3 = normalizeFtsScoreImproved(-3);

    // Check exponential relationship (ratio should be roughly constant)
    const ratio1 = score1 / score2;
    const ratio2 = score2 / score3;
    expect(ratio1).toBeCloseTo(ratio2, 1);
  });
});

describe('FTS5 Query Sanitization', () => {
  it('should remove FTS5 special characters', () => {
    expect(sanitizeFtsQuery('hello?')).toBe('hello');
    expect(sanitizeFtsQuery('test*')).toBe('test');
    expect(sanitizeFtsQuery('a + b')).toBe('a b');
    expect(sanitizeFtsQuery('NOT this')).toBe('NOT this');
  });

  it('should handle quotes', () => {
    expect(sanitizeFtsQuery('"exact phrase"')).toBe('exact phrase');
    expect(sanitizeFtsQuery("it's a test")).toBe('it s a test');
  });

  it('should normalize whitespace', () => {
    expect(sanitizeFtsQuery('  hello   world  ')).toBe('hello world');
    expect(sanitizeFtsQuery('a  b  c')).toBe('a b c');
  });

  it('should handle empty result by returning original', () => {
    expect(sanitizeFtsQuery('???')).toBe('???');
    expect(sanitizeFtsQuery('***')).toBe('***');
  });

  it('should preserve valid queries', () => {
    expect(sanitizeFtsQuery('oracle philosophy')).toBe('oracle philosophy');
    expect(sanitizeFtsQuery('git safety')).toBe('git safety');
  });

  it('should handle consult-style queries with special characters', () => {
    // These were causing "fts5: syntax error" in oracle_consult
    expect(sanitizeFtsQuery('claude.memory')).toBe('claude memory');
    expect(sanitizeFtsQuery('What should I do?')).toBe('What should I do');
    expect(sanitizeFtsQuery("user's decision")).toBe('user s decision');
    expect(sanitizeFtsQuery('agent-based system')).toBe('agent based system');
    expect(sanitizeFtsQuery('how do I (safely) delete files')).toBe('how do I safely delete files');
  });

  it('should handle colons which break FTS5', () => {
    expect(sanitizeFtsQuery('error: no such column')).toBe('error no such column');
    expect(sanitizeFtsQuery('time: 15:30')).toBe('time 15 30');
  });

  it('should handle forward slashes which break FTS5', () => {
    expect(sanitizeFtsQuery('Shopee/Lazada/TikTok')).toBe('Shopee Lazada TikTok');
    expect(sanitizeFtsQuery('path/to/file')).toBe('path to file');
    expect(sanitizeFtsQuery('and/or options')).toBe('and or options');
  });
});

describe('Concept Parsing', () => {
  it('should parse JSON array string', () => {
    expect(parseConceptsFromMetadata('["trust","pattern","safety"]'))
      .toEqual(['trust', 'pattern', 'safety']);
  });

  it('should parse comma-separated string', () => {
    expect(parseConceptsFromMetadata('trust, pattern, safety'))
      .toEqual(['trust', 'pattern', 'safety']);
  });

  it('should handle actual array', () => {
    expect(parseConceptsFromMetadata(['trust', 'pattern']))
      .toEqual(['trust', 'pattern']);
  });

  it('should handle empty/null values', () => {
    expect(parseConceptsFromMetadata(null)).toEqual([]);
    expect(parseConceptsFromMetadata(undefined)).toEqual([]);
    expect(parseConceptsFromMetadata('')).toEqual([]);
  });

  it('should filter non-string values from arrays', () => {
    expect(parseConceptsFromMetadata(['trust', 123, 'pattern', null]))
      .toEqual(['trust', 'pattern']);
  });
});

describe('Result Combination (Hybrid Search)', () => {
  const ftsResults = [
    { id: 'doc1', type: 'principle', content: 'Content 1', source_file: 'f1.md', concepts: ['trust'], score: 0.8, source: 'fts' as const },
    { id: 'doc2', type: 'learning', content: 'Content 2', source_file: 'f2.md', concepts: ['pattern'], score: 0.6, source: 'fts' as const },
  ];

  const vectorResults = [
    { id: 'doc1', type: 'principle', content: 'Content 1', source_file: 'f1.md', concepts: ['trust'], score: 0.9, source: 'vector' as const },
    { id: 'doc3', type: 'retro', content: 'Content 3', source_file: 'f3.md', concepts: ['decision'], score: 0.7, source: 'vector' as const },
  ];

  it('should combine results and mark duplicates as hybrid', () => {
    const combined = combineResults(ftsResults, vectorResults);

    const doc1 = combined.find(r => r.id === 'doc1');
    expect(doc1?.source).toBe('hybrid');
    expect(doc1?.ftsScore).toBe(0.8);
    expect(doc1?.vectorScore).toBe(0.9);
  });

  it('should keep FTS-only results as fts source', () => {
    const combined = combineResults(ftsResults, vectorResults);

    const doc2 = combined.find(r => r.id === 'doc2');
    expect(doc2?.source).toBe('fts');
  });

  it('should keep vector-only results as vector source', () => {
    const combined = combineResults(ftsResults, vectorResults);

    const doc3 = combined.find(r => r.id === 'doc3');
    expect(doc3?.source).toBe('vector');
  });

  it('should apply 10% boost for hybrid results', () => {
    const combined = combineResults(ftsResults, vectorResults, 0.5, 0.5);

    const doc1 = combined.find(r => r.id === 'doc1');
    // Hybrid score: ((0.5 * 0.8) + (0.5 * 0.9)) * 1.1 = 0.935
    expect(doc1?.score).toBeCloseTo(0.935, 2);
  });

  it('should sort by score descending', () => {
    const combined = combineResults(ftsResults, vectorResults);

    for (let i = 1; i < combined.length; i++) {
      expect(combined[i - 1].score).toBeGreaterThanOrEqual(combined[i].score);
    }
  });

  it('should handle empty inputs', () => {
    expect(combineResults([], [])).toEqual([]);
    expect(combineResults(ftsResults, [])).toHaveLength(2);
    expect(combineResults([], vectorResults)).toHaveLength(2);
  });
});

describe('Query-Aware Weights', () => {
  it('should favor FTS for short queries', () => {
    const weights = getQueryWeights('git');
    expect(weights.fts).toBeGreaterThan(weights.vector);
  });

  it('should favor FTS for two-word queries', () => {
    const weights = getQueryWeights('git safety');
    expect(weights.fts).toBeGreaterThan(weights.vector);
  });

  it('should favor vector for long queries', () => {
    const weights = getQueryWeights('how do I handle errors when the database connection fails');
    expect(weights.vector).toBeGreaterThan(weights.fts);
  });

  it('should favor FTS for phrase queries', () => {
    const weights = getQueryWeights('"exact phrase match"');
    expect(weights.fts).toBeGreaterThan(weights.vector);
  });

  it('should favor FTS for boolean queries', () => {
    const weights = getQueryWeights('trust AND safety NOT danger');
    expect(weights.fts).toBeGreaterThan(weights.vector);
  });

  it('should return balanced weights for medium queries', () => {
    const weights = getQueryWeights('oracle philosophy principles');
    expect(weights.fts).toBe(0.5);
    expect(weights.vector).toBe(0.5);
  });
});

// ============================================================================
// Integration Tests (require database)
// ============================================================================

describe('Database Integration', () => {
  let db: Database.Database;
  const testDbPath = '/tmp/oracle-test.db';

  beforeAll(() => {
    // Create test database
    db = new Database(testDbPath);

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS oracle_documents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        source_file TEXT NOT NULL,
        concepts TEXT DEFAULT '[]'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS oracle_fts USING fts5(
        id UNINDEXED,
        content,
        concepts
      );
    `);

    // Insert test data
    const insertDoc = db.prepare(`
      INSERT INTO oracle_documents (id, type, content, source_file, concepts)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertFts = db.prepare(`
      INSERT INTO oracle_fts (id, content, concepts)
      VALUES (?, ?, ?)
    `);

    const testDocs = [
      { id: 'test1', type: 'principle', content: 'Nothing is deleted', source_file: 'test.md', concepts: '["trust","safety"]' },
      { id: 'test2', type: 'learning', content: 'Git safety patterns', source_file: 'test.md', concepts: '["git","safety"]' },
      { id: 'test3', type: 'retro', content: 'Session retrospective', source_file: 'retro.md', concepts: '["session"]' },
    ];

    for (const doc of testDocs) {
      insertDoc.run(doc.id, doc.type, doc.content, doc.source_file, doc.concepts);
      insertFts.run(doc.id, doc.content, doc.concepts);
    }
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should have test data in database', () => {
    const count = db.prepare('SELECT COUNT(*) as count FROM oracle_documents').get() as { count: number };
    expect(count.count).toBe(3);
  });

  it('should search using FTS5', () => {
    const results = db.prepare(`
      SELECT id, content, rank
      FROM oracle_fts
      WHERE oracle_fts MATCH ?
      ORDER BY rank
    `).all('safety') as Array<{ id: string; content: string; rank: number }>;

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].rank).toBeLessThan(0); // FTS5 rank is negative
  });

  it('should filter by type', () => {
    const results = db.prepare(`
      SELECT d.id, d.type, d.content
      FROM oracle_documents d
      JOIN oracle_fts f ON d.id = f.id
      WHERE oracle_fts MATCH ? AND d.type = ?
    `).all('safety', 'principle') as Array<{ id: string; type: string; content: string }>;

    expect(results.every(r => r.type === 'principle')).toBe(true);
  });

  it('should return correct document structure', () => {
    const doc = db.prepare('SELECT * FROM oracle_documents WHERE id = ?').get('test1') as {
      id: string;
      type: string;
      content: string;
      source_file: string;
      concepts: string;
    };

    expect(doc).toBeDefined();
    expect(doc.id).toBe('test1');
    expect(doc.type).toBe('principle');
    expect(doc.content).toBe('Nothing is deleted');
    expect(JSON.parse(doc.concepts)).toEqual(['trust', 'safety']);
  });
});

// ============================================================================
// Path Security Tests
// ============================================================================

describe('Path Security', () => {
  const REPO_ROOT = '/Users/nat/Code/github.com/laris-co/oracle-v2';

  function isPathSafe(requestedPath: string, repoRoot: string): boolean {
    // Resolve the path to handle .. and symlinks
    const resolved = path.resolve(repoRoot, requestedPath);

    // Use realpath if file exists to resolve symlinks
    let realPath: string;
    try {
      realPath = fs.realpathSync(resolved);
    } catch {
      // File doesn't exist, use resolved path
      realPath = resolved;
    }

    return realPath.startsWith(repoRoot);
  }

  it('should allow paths within repo root', () => {
    expect(isPathSafe('src/index.ts', REPO_ROOT)).toBe(true);
    expect(isPathSafe('./src/index.ts', REPO_ROOT)).toBe(true);
    expect(isPathSafe('ψ/memory/learnings/test.md', REPO_ROOT)).toBe(true);
  });

  it('should block path traversal attempts', () => {
    expect(isPathSafe('../../../etc/passwd', REPO_ROOT)).toBe(false);
    expect(isPathSafe('src/../../../etc/passwd', REPO_ROOT)).toBe(false);
  });

  it('should handle absolute paths', () => {
    expect(isPathSafe('/etc/passwd', '/')).toBe(true); // Relative to /
    expect(isPathSafe('/etc/passwd', REPO_ROOT)).toBe(false);
  });
});

// ============================================================================
// Dashboard Logging Tests
// ============================================================================

describe('Dashboard Logging Functions', () => {
  let testDb: Database.Database;
  const testDbPath = '/tmp/oracle-dashboard-test.db';

  beforeAll(() => {
    // Create test database with logging tables
    testDb = new Database(testDbPath);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS search_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        type TEXT,
        mode TEXT,
        results_count INTEGER,
        search_time_ms INTEGER,
        created_at INTEGER NOT NULL
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS learn_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        pattern_preview TEXT,
        source TEXT,
        concepts TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS document_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        access_type TEXT,
        created_at INTEGER NOT NULL
      )
    `);
  });

  afterAll(() => {
    testDb.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should insert search log entries', () => {
    const now = Date.now();
    testDb.prepare(`
      INSERT INTO search_log (query, type, mode, results_count, search_time_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('test query', 'all', 'fts', 5, 42, now);

    const result = testDb.prepare('SELECT * FROM search_log WHERE query = ?').get('test query') as any;
    expect(result).toBeDefined();
    expect(result.query).toBe('test query');
    expect(result.results_count).toBe(5);
    expect(result.search_time_ms).toBe(42);
  });

  it('should insert learn log entries', () => {
    const now = Date.now();
    testDb.prepare(`
      INSERT INTO learn_log (document_id, pattern_preview, source, concepts, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('learn_test_1', 'Test pattern...', 'Oracle Learn', '["test","pattern"]', now);

    const result = testDb.prepare('SELECT * FROM learn_log WHERE document_id = ?').get('learn_test_1') as any;
    expect(result).toBeDefined();
    expect(result.document_id).toBe('learn_test_1');
    expect(result.pattern_preview).toBe('Test pattern...');
    expect(JSON.parse(result.concepts)).toEqual(['test', 'pattern']);
  });

  it('should insert document access entries', () => {
    const now = Date.now();
    testDb.prepare(`
      INSERT INTO document_access (document_id, access_type, created_at)
      VALUES (?, ?, ?)
    `).run('doc_test_1', 'search', now);

    const result = testDb.prepare('SELECT * FROM document_access WHERE document_id = ?').get('doc_test_1') as any;
    expect(result).toBeDefined();
    expect(result.document_id).toBe('doc_test_1');
    expect(result.access_type).toBe('search');
  });

  it('should query activity within date range', () => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const twoDaysAgo = now - 172800000;

    // Insert entries at different times
    testDb.prepare(`INSERT INTO search_log (query, type, mode, results_count, search_time_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('recent query', 'all', 'fts', 3, 10, oneHourAgo);
    testDb.prepare(`INSERT INTO search_log (query, type, mode, results_count, search_time_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('old query', 'all', 'fts', 2, 15, twoDaysAgo);

    // Query last 24 hours
    const oneDayAgo = now - 86400000;
    const recentResults = testDb.prepare('SELECT * FROM search_log WHERE created_at > ?').all(oneDayAgo) as any[];

    expect(recentResults.some(r => r.query === 'recent query')).toBe(true);
    expect(recentResults.some(r => r.query === 'old query')).toBe(false);
  });
});

describe('Dashboard Data Aggregation', () => {
  it('should aggregate concept counts correctly', () => {
    const conceptsData = [
      '["trust", "safety"]',
      '["trust", "pattern"]',
      '["safety", "git"]',
      '["trust"]'
    ];

    const conceptCounts = new Map<string, number>();
    for (const conceptStr of conceptsData) {
      const concepts = JSON.parse(conceptStr);
      concepts.forEach((c: string) => {
        conceptCounts.set(c, (conceptCounts.get(c) || 0) + 1);
      });
    }

    expect(conceptCounts.get('trust')).toBe(3);
    expect(conceptCounts.get('safety')).toBe(2);
    expect(conceptCounts.get('pattern')).toBe(1);
    expect(conceptCounts.get('git')).toBe(1);
  });

  it('should sort concepts by count descending', () => {
    const conceptCounts = new Map([
      ['trust', 3],
      ['safety', 2],
      ['pattern', 1],
      ['git', 1]
    ]);

    const sorted = Array.from(conceptCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    expect(sorted[0].name).toBe('trust');
    expect(sorted[0].count).toBe(3);
    expect(sorted[1].name).toBe('safety');
  });

  it('should calculate time ranges correctly', () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Verify 7 days in milliseconds
    expect(now - sevenDaysAgo).toBe(604800000);

    // Verify date boundary calculations
    const dayStart = now - (7 - 0) * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    expect(dayEnd - dayStart).toBe(86400000); // 1 day in ms
  });
});
