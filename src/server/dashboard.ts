/**
 * Oracle v2 Dashboard Handlers
 */

import { db } from './db.js';
import type { DashboardSummary, DashboardActivity, DashboardGrowth } from './types.js';

/**
 * Dashboard summary - aggregated stats for the dashboard
 */
export function handleDashboardSummary(): DashboardSummary {
  // Document counts
  const totalDocs = db.prepare('SELECT COUNT(*) as count FROM oracle_documents').get() as { count: number };
  const byType = db.prepare(`
    SELECT type, COUNT(*) as count
    FROM oracle_documents
    GROUP BY type
  `).all() as { type: string; count: number }[];

  // Concept counts
  const conceptsResult = db.prepare(`
    SELECT concepts FROM oracle_documents WHERE concepts IS NOT NULL AND concepts != '[]'
  `).all() as { concepts: string }[];

  const conceptCounts = new Map<string, number>();
  for (const row of conceptsResult) {
    try {
      const concepts = JSON.parse(row.concepts);
      if (Array.isArray(concepts)) {
        concepts.forEach((c: string) => {
          conceptCounts.set(c, (conceptCounts.get(c) || 0) + 1);
        });
      }
    } catch {}
  }

  const topConcepts = Array.from(conceptCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Activity counts (last 7 days)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  let consultations7d = 0;
  let searches7d = 0;
  let learnings7d = 0;

  try {
    const consultResult = db.prepare(`
      SELECT COUNT(*) as count FROM consult_log WHERE created_at > ?
    `).get(sevenDaysAgo) as { count: number };
    consultations7d = consultResult.count;
  } catch {}

  try {
    const searchResult = db.prepare(`
      SELECT COUNT(*) as count FROM search_log WHERE created_at > ?
    `).get(sevenDaysAgo) as { count: number };
    searches7d = searchResult.count;
  } catch {}

  try {
    const learnResult = db.prepare(`
      SELECT COUNT(*) as count FROM learn_log WHERE created_at > ?
    `).get(sevenDaysAgo) as { count: number };
    learnings7d = learnResult.count;
  } catch {}

  // Health status
  const lastIndexed = db.prepare(`
    SELECT MAX(indexed_at) as last_indexed FROM oracle_documents
  `).get() as { last_indexed: number | null };

  return {
    documents: {
      total: totalDocs.count,
      by_type: byType.reduce((acc, row) => ({ ...acc, [row.type]: row.count }), {})
    },
    concepts: {
      total: conceptCounts.size,
      top: topConcepts
    },
    activity: {
      consultations_7d: consultations7d,
      searches_7d: searches7d,
      learnings_7d: learnings7d
    },
    health: {
      fts_status: totalDocs.count > 0 ? 'healthy' : 'empty',
      last_indexed: lastIndexed.last_indexed
        ? new Date(lastIndexed.last_indexed).toISOString()
        : null
    }
  };
}

/**
 * Dashboard activity - recent consultations, searches, learnings
 */
export function handleDashboardActivity(days: number = 7): DashboardActivity {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  // Recent consultations
  let consultations: DashboardActivity['consultations'] = [];
  try {
    consultations = db.prepare(`
      SELECT decision, principles_found, patterns_found, created_at
      FROM consult_log
      WHERE created_at > ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(since).map((row: any) => ({
      decision: row.decision.substring(0, 100),
      principles_found: row.principles_found,
      patterns_found: row.patterns_found,
      created_at: new Date(row.created_at).toISOString()
    }));
  } catch {}

  // Recent searches
  let searches: DashboardActivity['searches'] = [];
  try {
    searches = db.prepare(`
      SELECT query, type, results_count, search_time_ms, created_at
      FROM search_log
      WHERE created_at > ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(since).map((row: any) => ({
      query: row.query.substring(0, 100),
      type: row.type,
      results_count: row.results_count,
      search_time_ms: row.search_time_ms,
      created_at: new Date(row.created_at).toISOString()
    }));
  } catch {}

  // Recent learnings
  let learnings: DashboardActivity['learnings'] = [];
  try {
    learnings = db.prepare(`
      SELECT document_id, pattern_preview, source, concepts, created_at
      FROM learn_log
      WHERE created_at > ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(since).map((row: any) => ({
      document_id: row.document_id,
      pattern_preview: row.pattern_preview,
      source: row.source,
      concepts: JSON.parse(row.concepts || '[]'),
      created_at: new Date(row.created_at).toISOString()
    }));
  } catch {}

  return { consultations, searches, learnings, days };
}

/**
 * Dashboard growth - documents and activity over time
 */
export function handleDashboardGrowth(period: string = 'week'): DashboardGrowth {
  const daysMap: Record<string, number> = {
    week: 7,
    month: 30,
    quarter: 90
  };
  const days = daysMap[period] || 7;

  // Get daily document counts
  const data: DashboardGrowth['data'] = [];

  for (let i = 0; i < days; i++) {
    const dayStart = Date.now() - (days - i) * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const date = new Date(dayStart).toISOString().split('T')[0];

    // Documents created that day
    const docsResult = db.prepare(`
      SELECT COUNT(*) as count FROM oracle_documents
      WHERE created_at >= ? AND created_at < ?
    `).get(dayStart, dayEnd) as { count: number };

    // Consultations that day
    let consultCount = 0;
    try {
      const consultResult = db.prepare(`
        SELECT COUNT(*) as count FROM consult_log
        WHERE created_at >= ? AND created_at < ?
      `).get(dayStart, dayEnd) as { count: number };
      consultCount = consultResult.count;
    } catch {}

    // Searches that day
    let searchCount = 0;
    try {
      const searchResult = db.prepare(`
        SELECT COUNT(*) as count FROM search_log
        WHERE created_at >= ? AND created_at < ?
      `).get(dayStart, dayEnd) as { count: number };
      searchCount = searchResult.count;
    } catch {}

    data.push({
      date,
      documents: docsResult.count,
      consultations: consultCount,
      searches: searchCount
    });
  }

  return { period, days, data };
}
