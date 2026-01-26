/**
 * Oracle v2 Database Schema (Drizzle ORM)
 *
 * Generated from existing database via drizzle-kit pull,
 * then cleaned up to exclude FTS5 internal tables.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// Main document index table
export const oracleDocuments = sqliteTable('oracle_documents', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  sourceFile: text('source_file').notNull(),
  concepts: text('concepts').notNull(), // JSON array
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  indexedAt: integer('indexed_at').notNull(),
  // Supersede pattern (Issue #19) - "Nothing is Deleted" but can be outdated
  supersededBy: text('superseded_by'),      // ID of newer document
  supersededAt: integer('superseded_at'),   // When it was superseded
  supersededReason: text('superseded_reason'), // Why (optional)
  // Provenance tracking (Issue #22)
  origin: text('origin'),                   // 'mother' | 'arthur' | 'volt' | 'human' | null (legacy)
  project: text('project'),                 // ghq-style: 'github.com/laris-co/oracle-v2'
  createdBy: text('created_by'),            // 'indexer' | 'oracle_learn' | 'manual'
}, (table) => [
  index('idx_source').on(table.sourceFile),
  index('idx_type').on(table.type),
  index('idx_superseded').on(table.supersededBy),
  index('idx_origin').on(table.origin),
  index('idx_project').on(table.project),
]);

// Indexing status tracking
export const indexingStatus = sqliteTable('indexing_status', {
  id: integer('id').primaryKey(),
  isIndexing: integer('is_indexing').default(0).notNull(),
  progressCurrent: integer('progress_current').default(0),
  progressTotal: integer('progress_total').default(0),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  error: text('error'),
  repoRoot: text('repo_root'),  // Root directory being indexed
});

// Search query logging
export const searchLog = sqliteTable('search_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  query: text('query').notNull(),
  type: text('type'),
  mode: text('mode'),
  resultsCount: integer('results_count'),
  searchTimeMs: integer('search_time_ms'),
  createdAt: integer('created_at').notNull(),
  project: text('project'),
  results: text('results'), // JSON array of top 5 results (id, type, score, snippet)
}, (table) => [
  index('idx_search_project').on(table.project),
  index('idx_search_created').on(table.createdAt),
]);

// Consultation logging
export const consultLog = sqliteTable('consult_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  decision: text('decision').notNull(),
  context: text('context'),
  principlesFound: integer('principles_found').notNull(),
  patternsFound: integer('patterns_found').notNull(),
  guidance: text('guidance').notNull(),
  createdAt: integer('created_at').notNull(),
  project: text('project'),
}, (table) => [
  index('idx_consult_project').on(table.project),
  index('idx_consult_created').on(table.createdAt),
]);

// Learning/pattern logging
export const learnLog = sqliteTable('learn_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentId: text('document_id').notNull(),
  patternPreview: text('pattern_preview'),
  source: text('source'),
  concepts: text('concepts'), // JSON array
  createdAt: integer('created_at').notNull(),
  project: text('project'),
}, (table) => [
  index('idx_learn_project').on(table.project),
  index('idx_learn_created').on(table.createdAt),
]);

// Document access logging
export const documentAccess = sqliteTable('document_access', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentId: text('document_id').notNull(),
  accessType: text('access_type'),
  createdAt: integer('created_at').notNull(),
  project: text('project'),
}, (table) => [
  index('idx_access_project').on(table.project),
  index('idx_access_created').on(table.createdAt),
  index('idx_access_doc').on(table.documentId),
]);

// ============================================================================
// Forum Tables (threaded discussions with Oracle)
// ============================================================================

// Forum threads - conversation topics
export const forumThreads = sqliteTable('forum_threads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  createdBy: text('created_by').default('human'),
  status: text('status').default('active'), // active, answered, pending, closed
  issueUrl: text('issue_url'),              // GitHub mirror URL
  issueNumber: integer('issue_number'),
  project: text('project'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  syncedAt: integer('synced_at'),
}, (table) => [
  index('idx_thread_status').on(table.status),
  index('idx_thread_project').on(table.project),
  index('idx_thread_created').on(table.createdAt),
]);

// Forum messages - individual Q&A in threads
export const forumMessages = sqliteTable('forum_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: integer('thread_id').notNull().references(() => forumThreads.id),
  role: text('role').notNull(),             // human, oracle, claude
  content: text('content').notNull(),
  author: text('author'),                   // GitHub username or "oracle"
  principlesFound: integer('principles_found'),
  patternsFound: integer('patterns_found'),
  searchQuery: text('search_query'),
  commentId: integer('comment_id'),         // GitHub comment ID if synced
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_message_thread').on(table.threadId),
  index('idx_message_role').on(table.role),
  index('idx_message_created').on(table.createdAt),
]);

// Note: FTS5 virtual table (oracle_fts) is managed via raw SQL
// since Drizzle doesn't natively support FTS5

// ============================================================================
// Decision Tracking Tables
// ============================================================================

// Decisions - structured decision tracking with lifecycle
export const decisions = sqliteTable('decisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  status: text('status').default('pending').notNull(), // pending, parked, researching, decided, implemented, closed
  context: text('context'),                            // Why this decision matters
  options: text('options'),                            // JSON: [{label, pros, cons}]
  decision: text('decision'),                          // What was decided
  rationale: text('rationale'),                        // Why this choice
  project: text('project'),                            // ghq path (optional)
  tags: text('tags'),                                  // JSON array
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  decidedAt: integer('decided_at'),                    // When status → decided
  decidedBy: text('decided_by'),                       // user or model name
}, (table) => [
  index('idx_decisions_status').on(table.status),
  index('idx_decisions_project').on(table.project),
  index('idx_decisions_created').on(table.createdAt),
]);

// ============================================================================
// Trace Log Tables (discovery tracing with dig points)
// ============================================================================

// Trace log - captures /trace sessions with actionable dig points
export const traceLog = sqliteTable('trace_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  traceId: text('trace_id').unique().notNull(),
  query: text('query').notNull(),
  queryType: text('query_type').default('general'),  // general, project, pattern, evolution

  // Dig Points (JSON arrays)
  foundFiles: text('found_files'),            // [{path, type, matchReason, confidence}]
  foundCommits: text('found_commits'),        // [{hash, shortHash, date, message}]
  foundIssues: text('found_issues'),          // [{number, title, state, url}]
  foundRetrospectives: text('found_retrospectives'),  // [paths]
  foundLearnings: text('found_learnings'),    // [paths]
  foundResonance: text('found_resonance'),    // [paths]

  // Counts (for quick stats)
  fileCount: integer('file_count').default(0),
  commitCount: integer('commit_count').default(0),
  issueCount: integer('issue_count').default(0),

  // Recursion
  depth: integer('depth').default(0),         // 0 = initial, 1+ = dig from parent
  parentTraceId: text('parent_trace_id'),     // Links to parent trace
  childTraceIds: text('child_trace_ids').default('[]'),  // Links to child traces

  // Context
  project: text('project'),                   // ghq format project path
  sessionId: text('session_id'),              // Claude session if available
  agentCount: integer('agent_count').default(1),
  durationMs: integer('duration_ms'),

  // Distillation
  status: text('status').default('raw'),      // raw, reviewed, distilling, distilled
  awakening: text('awakening'),               // Extracted insight (markdown)
  distilledToId: text('distilled_to_id'),     // Learning ID if promoted
  distilledAt: integer('distilled_at'),

  // Timestamps
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('idx_trace_query').on(table.query),
  index('idx_trace_project').on(table.project),
  index('idx_trace_status').on(table.status),
  index('idx_trace_parent').on(table.parentTraceId),
  index('idx_trace_created').on(table.createdAt),
]);

// ============================================================================
// Supersede Log (Issue #18) - Audit trail for "Nothing is Deleted"
// ============================================================================

// Tracks document supersessions even when original file is deleted
// This is separate from oracle_documents.superseded_by to preserve history
export const supersedeLog = sqliteTable('supersede_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // What was superseded
  oldPath: text('old_path').notNull(),        // Original file path (may no longer exist)
  oldId: text('old_id'),                       // Document ID if it was indexed
  oldTitle: text('old_title'),                 // Preserved title for display
  oldType: text('old_type'),                   // learning, principle, retro, etc.

  // What replaced it (null if just deleted/archived)
  newPath: text('new_path'),                   // Replacement file path
  newId: text('new_id'),                       // Document ID of replacement
  newTitle: text('new_title'),                 // Title of replacement

  // Why and when
  reason: text('reason'),                      // Why superseded (duplicate, outdated, merged)
  supersededAt: integer('superseded_at').notNull(),
  supersededBy: text('superseded_by'),         // Who made the decision (user, claude, indexer)

  // Context
  project: text('project'),                    // ghq format project path

}, (table) => [
  index('idx_supersede_old_path').on(table.oldPath),
  index('idx_supersede_new_path').on(table.newPath),
  index('idx_supersede_created').on(table.supersededAt),
  index('idx_supersede_project').on(table.project),
]);

// ============================================================================
// Activity Log - User activity tracking
// ============================================================================

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),             // YYYY-MM-DD
  timestamp: text('timestamp').notNull(),   // ISO timestamp
  type: text('type').notNull(),             // file_created, file_modified, etc.
  path: text('path'),                        // File path if applicable
  sizeBytes: integer('size_bytes'),
  project: text('project'),                  // ghq format project path
  metadata: text('metadata', { mode: 'json' }), // Additional data as JSON
  createdAt: text('created_at'),             // Auto timestamp
}, (table) => [
  index('idx_activity_date').on(table.date),
  index('idx_activity_type').on(table.type),
  index('idx_activity_project').on(table.project),
]);
