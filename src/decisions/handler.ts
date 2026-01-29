/**
 * Oracle Decision Handler
 *
 * CRUD operations for structured decision tracking.
 * Following the same patterns as forum/handler.ts
 *
 * Refactored to use Drizzle ORM for type-safe queries.
 */

import { eq, and, desc, sql, like, or } from 'drizzle-orm';
import { db, decisions } from '../db/index.js';
import { getProjectContext } from '../server/context.js';
import type {
  Decision,
  DecisionStatus,
  DecisionOption,
  CreateDecisionInput,
  UpdateDecisionInput,
  ListDecisionsInput,
  ListDecisionsOutput,
} from './types.js';
import { isValidTransition } from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get project context from environment (ghq path detection)
 */
function getProjectContext_(): string | undefined {
  const projectCtx = getProjectContext(process.cwd());
  return projectCtx && 'repo' in projectCtx ? projectCtx.repo : undefined;
}

/**
 * Parse a row from the database into a Decision object
 */
function parseDecisionRow(row: typeof decisions.$inferSelect): Decision {
  return {
    id: row.id,
    title: row.title,
    status: row.status as DecisionStatus,
    context: row.context,
    options: row.options ? JSON.parse(row.options) : null,
    decision: row.decision,
    rationale: row.rationale,
    project: row.project,
    tags: row.tags ? JSON.parse(row.tags) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new decision
 */
export function createDecision(input: CreateDecisionInput): Decision {
  const now = Date.now();
  const project = input.project || getProjectContext_();

  const result = db.insert(decisions).values({
    title: input.title,
    context: input.context || null,
    options: input.options ? JSON.stringify(input.options) : null,
    project: project || null,
    tags: input.tags ? JSON.stringify(input.tags) : null,
    createdAt: now,
    updatedAt: now,
  }).run();

  return {
    id: Number(result.lastInsertRowid),
    title: input.title,
    status: 'pending',
    context: input.context || null,
    options: input.options || null,
    decision: null,
    rationale: null,
    project: project || null,
    tags: input.tags || null,
    createdAt: now,
    updatedAt: now,
    decidedAt: null,
    decidedBy: null,
  };
}

/**
 * Get decision by ID
 */
export function getDecision(id: number): Decision | null {
  const row = db.select()
    .from(decisions)
    .where(eq(decisions.id, id))
    .get();

  if (!row) return null;
  return parseDecisionRow(row);
}

/**
 * Update a decision
 */
export function updateDecision(input: UpdateDecisionInput): Decision | null {
  const existing = getDecision(input.id);
  if (!existing) return null;

  const now = Date.now();
  const updateData: Partial<typeof decisions.$inferInsert> = { updatedAt: now };

  if (input.title !== undefined) {
    updateData.title = input.title;
  }
  if (input.context !== undefined) {
    updateData.context = input.context;
  }
  if (input.options !== undefined) {
    updateData.options = JSON.stringify(input.options);
  }
  if (input.decision !== undefined) {
    updateData.decision = input.decision;
  }
  if (input.rationale !== undefined) {
    updateData.rationale = input.rationale;
  }
  if (input.tags !== undefined) {
    updateData.tags = JSON.stringify(input.tags);
  }
  if (input.status !== undefined) {
    // Validate transition
    if (!isValidTransition(existing.status, input.status)) {
      throw new Error(
        `Invalid status transition: ${existing.status} → ${input.status}`
      );
    }
    updateData.status = input.status;

    // Set decidedAt when transitioning to 'decided'
    if (input.status === 'decided' && existing.status !== 'decided') {
      updateData.decidedAt = now;
      if (input.decidedBy) {
        updateData.decidedBy = input.decidedBy;
      }
    }
  }

  db.update(decisions)
    .set(updateData)
    .where(eq(decisions.id, input.id))
    .run();

  return getDecision(input.id);
}

/**
 * Transition decision status with validation
 */
export function transitionStatus(
  id: number,
  newStatus: DecisionStatus,
  decidedBy?: string
): Decision | null {
  const existing = getDecision(id);
  if (!existing) return null;

  if (!isValidTransition(existing.status, newStatus)) {
    throw new Error(
      `Invalid status transition: ${existing.status} → ${newStatus}`
    );
  }

  const now = Date.now();
  const updateData: Partial<typeof decisions.$inferInsert> = {
    status: newStatus,
    updatedAt: now,
  };

  // Set decidedAt when transitioning to 'decided'
  if (newStatus === 'decided' && existing.status !== 'decided') {
    updateData.decidedAt = now;
    if (decidedBy) {
      updateData.decidedBy = decidedBy;
    }
  }

  db.update(decisions)
    .set(updateData)
    .where(eq(decisions.id, id))
    .run();

  return getDecision(id);
}

/**
 * List decisions with optional filters
 */
export function listDecisions(
  options: ListDecisionsInput = {}
): ListDecisionsOutput {
  const { status, project, tags, limit = 20, offset = 0 } = options;

  // Build conditions array
  const conditions = [];
  if (status) {
    conditions.push(eq(decisions.status, status));
  }
  if (project) {
    conditions.push(eq(decisions.project, project));
  }
  if (tags && tags.length > 0) {
    // Match any of the provided tags (using LIKE for JSON array)
    const tagConditions = tags.map(tag => like(decisions.tags, `%"${tag}"%`));
    conditions.push(or(...tagConditions)!);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get count
  const countResult = db.select({ count: sql<number>`count(*)` })
    .from(decisions)
    .where(whereClause)
    .get();
  const total = countResult?.count || 0;

  // Get decisions
  const rows = db.select()
    .from(decisions)
    .where(whereClause)
    .orderBy(desc(decisions.updatedAt))
    .limit(limit)
    .offset(offset)
    .all();

  return {
    decisions: rows.map(parseDecisionRow),
    total,
  };
}

/**
 * Delete a decision (soft delete by setting status to closed)
 */
export function deleteDecision(id: number): boolean {
  const existing = getDecision(id);
  if (!existing) return false;

  db.update(decisions)
    .set({ status: 'closed', updatedAt: Date.now() })
    .where(eq(decisions.id, id))
    .run();

  return true;
}

/**
 * Get decisions by status counts (for dashboard)
 */
export function getDecisionCounts(): Record<DecisionStatus, number> {
  const rows = db.select({
    status: decisions.status,
    count: sql<number>`count(*)`
  })
    .from(decisions)
    .groupBy(decisions.status)
    .all();

  const counts: Record<DecisionStatus, number> = {
    pending: 0,
    parked: 0,
    researching: 0,
    decided: 0,
    implemented: 0,
    closed: 0,
  };

  for (const row of rows) {
    counts[row.status as DecisionStatus] = row.count;
  }

  return counts;
}
