/**
 * Trace Log Handler
 * Issue #17: feat: Trace Log — Make discoveries traceable and diggable
 */

import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';
import type {
  CreateTraceInput,
  CreateTraceResult,
  ListTracesInput,
  ListTracesResult,
  GetTraceInput,
  TraceRecord,
  TraceSummary,
  TraceChainResult,
  DistillTraceInput,
} from './types.js';

/**
 * Create a new trace log entry
 */
export function createTrace(db: Database, input: CreateTraceInput): CreateTraceResult {
  const traceId = randomUUID();
  const now = Date.now();

  // Calculate counts
  const fileCount =
    (input.foundFiles?.length || 0) +
    (input.foundRetrospectives?.length || 0) +
    (input.foundLearnings?.length || 0) +
    (input.foundResonance?.length || 0);
  const commitCount = input.foundCommits?.length || 0;
  const issueCount = input.foundIssues?.length || 0;

  // Determine depth from parent
  let depth = 0;
  if (input.parentTraceId) {
    const parent = db
      .query('SELECT depth FROM trace_log WHERE trace_id = ?')
      .get(input.parentTraceId) as { depth: number } | null;
    if (parent) depth = parent.depth + 1;
  }

  // Insert trace
  db.run(
    `
    INSERT INTO trace_log (
      trace_id, query, query_type,
      found_files, found_commits, found_issues,
      found_retrospectives, found_learnings, found_resonance,
      file_count, commit_count, issue_count,
      depth, parent_trace_id, child_trace_ids,
      project, session_id, agent_count, duration_ms,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      traceId,
      input.query,
      input.queryType || 'general',
      JSON.stringify(input.foundFiles || []),
      JSON.stringify(input.foundCommits || []),
      JSON.stringify(input.foundIssues || []),
      JSON.stringify(input.foundRetrospectives || []),
      JSON.stringify(input.foundLearnings || []),
      JSON.stringify(input.foundResonance || []),
      fileCount,
      commitCount,
      issueCount,
      depth,
      input.parentTraceId || null,
      '[]',
      input.project || null,
      input.sessionId || null,
      input.agentCount || 1,
      input.durationMs || null,
      'raw',
      now,
      now,
    ]
  );

  // Update parent's child_trace_ids
  if (input.parentTraceId) {
    updateTraceChildren(db, input.parentTraceId, traceId);
  }

  return {
    success: true,
    traceId,
    depth,
    summary: {
      fileCount,
      commitCount,
      issueCount,
      totalDigPoints: fileCount + commitCount + issueCount,
    },
  };
}

/**
 * Get a trace by ID
 */
export function getTrace(db: Database, traceId: string): TraceRecord | null {
  const row = db.query('SELECT * FROM trace_log WHERE trace_id = ?').get(traceId);
  if (!row) return null;
  return parseTraceRow(row);
}

/**
 * List traces with optional filters
 */
export function listTraces(db: Database, input: ListTracesInput): ListTracesResult {
  const conditions: string[] = ['1=1'];
  const params: (string | number)[] = [];

  if (input.query) {
    conditions.push('query LIKE ?');
    params.push(`%${input.query}%`);
  }
  if (input.project) {
    conditions.push('project = ?');
    params.push(input.project);
  }
  if (input.status) {
    conditions.push('status = ?');
    params.push(input.status);
  }
  if (input.depth !== undefined) {
    conditions.push('depth = ?');
    params.push(input.depth);
  }

  const where = conditions.join(' AND ');
  const limit = input.limit || 20;
  const offset = input.offset || 0;

  const countResult = db
    .query(`SELECT COUNT(*) as count FROM trace_log WHERE ${where}`)
    .get(...params) as { count: number };
  const total = countResult.count;

  const rows = db
    .query(
      `
    SELECT trace_id, query, depth, file_count, commit_count, issue_count, status, awakening, parent_trace_id, prev_trace_id, next_trace_id, created_at
    FROM trace_log WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, limit, offset) as any[];

  return {
    traces: rows.map((r) => ({
      traceId: r.trace_id,
      parentTraceId: r.parent_trace_id,
      prevTraceId: r.prev_trace_id,
      nextTraceId: r.next_trace_id,
      query: r.query,
      depth: r.depth,
      fileCount: r.file_count,
      commitCount: r.commit_count,
      issueCount: r.issue_count,
      status: r.status,
      hasAwakening: !!r.awakening,
      createdAt: r.created_at,
    })),
    total,
    hasMore: offset + rows.length < total,
  };
}

/**
 * Get the full trace chain (ancestors + descendants)
 */
export function getTraceChain(
  db: Database,
  traceId: string,
  direction: 'up' | 'down' | 'both' = 'both'
): TraceChainResult {
  const chain: TraceSummary[] = [];
  let hasAwakening = false;
  let awakeningTraceId: string | undefined;

  // Get ancestors (up)
  if (direction === 'up' || direction === 'both') {
    let current = getTrace(db, traceId);
    while (current?.parentTraceId) {
      const parent = getTrace(db, current.parentTraceId);
      if (parent) {
        chain.unshift(toSummary(parent));
        if (parent.awakening) {
          hasAwakening = true;
          awakeningTraceId = parent.traceId;
        }
      }
      current = parent;
    }
  }

  // Add self
  const self = getTrace(db, traceId);
  if (self) {
    chain.push(toSummary(self));
    if (self.awakening) {
      hasAwakening = true;
      awakeningTraceId = self.traceId;
    }
  }

  // Get descendants (down) - BFS
  if (direction === 'down' || direction === 'both') {
    const queue = self?.childTraceIds || [];
    while (queue.length > 0) {
      const childId = queue.shift()!;
      const child = getTrace(db, childId);
      if (child) {
        chain.push(toSummary(child));
        if (child.awakening) {
          hasAwakening = true;
          awakeningTraceId = child.traceId;
        }
        queue.push(...child.childTraceIds);
      }
    }
  }

  return {
    chain,
    totalDepth: Math.max(...chain.map((t) => t.depth), 0),
    hasAwakening,
    awakeningTraceId,
  };
}

/**
 * Link two traces as a chain (prev ← → next)
 * "Nothing is Deleted" - just creates bidirectional links
 */
export function linkTraces(
  db: Database,
  prevTraceId: string,
  nextTraceId: string
): { success: boolean; message: string; prevTrace?: TraceRecord; nextTrace?: TraceRecord } {
  const prevTrace = getTrace(db, prevTraceId);
  const nextTrace = getTrace(db, nextTraceId);

  if (!prevTrace) return { success: false, message: `Previous trace not found: ${prevTraceId}` };
  if (!nextTrace) return { success: false, message: `Next trace not found: ${nextTraceId}` };

  // Check if either already has a link in that direction
  if (prevTrace.nextTraceId) {
    return { success: false, message: `Trace ${prevTraceId} already has a next link` };
  }
  if (nextTrace.prevTraceId) {
    return { success: false, message: `Trace ${nextTraceId} already has a prev link` };
  }

  const now = Date.now();

  // Update prev trace to point to next
  db.run(
    'UPDATE trace_log SET next_trace_id = ?, updated_at = ? WHERE trace_id = ?',
    [nextTraceId, now, prevTraceId]
  );

  // Update next trace to point to prev
  db.run(
    'UPDATE trace_log SET prev_trace_id = ?, updated_at = ? WHERE trace_id = ?',
    [prevTraceId, now, nextTraceId]
  );

  return {
    success: true,
    message: `Linked: ${prevTraceId} → ${nextTraceId}`,
    prevTrace: getTrace(db, prevTraceId) || undefined,
    nextTrace: getTrace(db, nextTraceId) || undefined,
  };
}

/**
 * Unlink two traces (remove the chain connection)
 */
export function unlinkTraces(
  db: Database,
  traceId: string,
  direction: 'prev' | 'next'
): { success: boolean; message: string } {
  const trace = getTrace(db, traceId);
  if (!trace) return { success: false, message: `Trace not found: ${traceId}` };

  const now = Date.now();

  if (direction === 'next' && trace.nextTraceId) {
    // Remove link from this trace
    db.run('UPDATE trace_log SET next_trace_id = NULL, updated_at = ? WHERE trace_id = ?', [now, traceId]);
    // Remove back-link from next trace
    db.run('UPDATE trace_log SET prev_trace_id = NULL, updated_at = ? WHERE trace_id = ?', [now, trace.nextTraceId]);
    return { success: true, message: `Unlinked next: ${traceId} -/-> ${trace.nextTraceId}` };
  }

  if (direction === 'prev' && trace.prevTraceId) {
    // Remove link from this trace
    db.run('UPDATE trace_log SET prev_trace_id = NULL, updated_at = ? WHERE trace_id = ?', [now, traceId]);
    // Remove back-link from prev trace
    db.run('UPDATE trace_log SET next_trace_id = NULL, updated_at = ? WHERE trace_id = ?', [now, trace.prevTraceId]);
    return { success: true, message: `Unlinked prev: ${trace.prevTraceId} -/-> ${traceId}` };
  }

  return { success: false, message: `No ${direction} link to remove` };
}

/**
 * Get the full linked chain for a trace
 */
export function getTraceLinkedChain(
  db: Database,
  traceId: string
): { chain: TraceRecord[]; position: number } {
  const chain: TraceRecord[] = [];
  let position = 0;

  // Walk backwards to find the start
  let current = getTrace(db, traceId);
  const visited = new Set<string>();

  while (current?.prevTraceId && !visited.has(current.prevTraceId)) {
    visited.add(current.traceId);
    current = getTrace(db, current.prevTraceId);
  }

  // Now walk forward from start
  while (current && !visited.has(current.traceId)) {
    if (current.traceId === traceId) {
      position = chain.length;
    }
    chain.push(current);
    visited.add(current.traceId);
    if (current.nextTraceId) {
      current = getTrace(db, current.nextTraceId);
    } else {
      break;
    }
  }

  return { chain, position };
}

/**
 * Distill awakening from a trace
 */
export function distillTrace(
  db: Database,
  input: DistillTraceInput
): { success: boolean; status: string; learningId?: string } {
  const now = Date.now();

  db.run(
    `
    UPDATE trace_log
    SET status = 'distilled', awakening = ?, distilled_at = ?, updated_at = ?
    WHERE trace_id = ?
  `,
    [input.awakening, now, now, input.traceId]
  );

  // TODO: If promoteToLearning, call oracle_learn
  // This would require access to the learn function

  return {
    success: true,
    status: 'distilled',
  };
}

/**
 * Update parent's child_trace_ids
 */
function updateTraceChildren(db: Database, parentId: string, childId: string) {
  const parent = db
    .query('SELECT child_trace_ids FROM trace_log WHERE trace_id = ?')
    .get(parentId) as { child_trace_ids: string } | null;

  if (parent) {
    const children = JSON.parse(parent.child_trace_ids || '[]');
    children.push(childId);
    db.run('UPDATE trace_log SET child_trace_ids = ?, updated_at = ? WHERE trace_id = ?', [
      JSON.stringify(children),
      Date.now(),
      parentId,
    ]);
  }
}

/**
 * Parse database row to TraceRecord
 */
function parseTraceRow(row: any): TraceRecord {
  return {
    id: row.id,
    traceId: row.trace_id,
    query: row.query,
    queryType: row.query_type,
    foundFiles: JSON.parse(row.found_files || '[]'),
    foundCommits: JSON.parse(row.found_commits || '[]'),
    foundIssues: JSON.parse(row.found_issues || '[]'),
    foundRetrospectives: JSON.parse(row.found_retrospectives || '[]'),
    foundLearnings: JSON.parse(row.found_learnings || '[]'),
    foundResonance: JSON.parse(row.found_resonance || '[]'),
    fileCount: row.file_count,
    commitCount: row.commit_count,
    issueCount: row.issue_count,
    depth: row.depth,
    parentTraceId: row.parent_trace_id,
    childTraceIds: JSON.parse(row.child_trace_ids || '[]'),
    prevTraceId: row.prev_trace_id,
    nextTraceId: row.next_trace_id,
    project: row.project,
    sessionId: row.session_id,
    agentCount: row.agent_count,
    durationMs: row.duration_ms,
    status: row.status,
    awakening: row.awakening,
    distilledToId: row.distilled_to_id,
    distilledAt: row.distilled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert TraceRecord to TraceSummary
 */
function toSummary(t: TraceRecord): TraceSummary {
  return {
    traceId: t.traceId,
    query: t.query,
    depth: t.depth,
    fileCount: t.fileCount,
    commitCount: t.commitCount,
    issueCount: t.issueCount,
    status: t.status,
    hasAwakening: !!t.awakening,
    createdAt: t.createdAt,
  };
}

// Note: Migration handled by Drizzle. Run `bun run db:push` to apply schema changes.
