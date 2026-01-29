/**
 * Oracle Nightly HTTP Server - Hono.js Version
 *
 * Modern routing with Hono.js on Bun runtime.
 * Same handlers, same DB, just cleaner HTTP layer.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import fs from 'fs';
import path from 'path';

import {
  configure,
  writePidFile,
  removePidFile,
  registerSignalHandlers,
  performGracefulShutdown,
} from './process-manager/index.js';

// Import from modular components
import {
  PORT,
  REPO_ROOT,
  DB_PATH,
  UI_PATH,
  ARTHUR_UI_PATH,
  DASHBOARD_PATH,
  initLoggingTables,
  closeDb
} from './server/db.js';

import { eq, desc, gt, and, sql } from 'drizzle-orm';
import {
  db,
  sqlite,
  oracleDocuments,
  searchLog,
  consultLog,
  learnLog,
  supersedeLog,
  indexingStatus
} from './db/index.js';

import {
  handleSearch,
  handleConsult,
  handleReflect,
  handleList,
  handleStats,
  handleGraph,
  handleLearn
} from './server/handlers.js';

import {
  handleDashboardSummary,
  handleDashboardActivity,
  handleDashboardGrowth
} from './server/dashboard.js';

import { handleContext } from './server/context.js';

import {
  handleThreadMessage,
  listThreads,
  getFullThread,
  getMessages,
  updateThreadStatus
} from './forum/handler.js';

import {
  createDecision,
  getDecision,
  updateDecision,
  listDecisions,
  transitionStatus,
  getDecisionCounts
} from './decisions/handler.js';

import {
  listTraces,
  getTrace,
  getTraceChain
} from './trace/handler.js';

// Frontend static file serving
const FRONTEND_DIST = path.join(import.meta.dirname || __dirname, '..', 'frontend', 'dist');

// Initialize logging tables on startup
try {
  initLoggingTables();
} catch (e) {
  console.error('Failed to initialize logging tables:', e);
}

// Reset stale indexing status on startup using Drizzle
try {
  db.update(indexingStatus)
    .set({ isIndexing: 0 })
    .where(eq(indexingStatus.id, 1))
    .run();
  console.log('🔮 Reset indexing status on startup');
} catch (e) {
  // Table might not exist yet - that's fine
}

// Configure process lifecycle management
const dataDir = path.join(import.meta.dirname || __dirname, '..');
configure({ dataDir, pidFileName: 'oracle-http.pid' });

// Write PID file for process tracking
writePidFile({ pid: process.pid, port: Number(PORT), startedAt: new Date().toISOString(), name: 'oracle-http' });

// Register graceful shutdown handlers
registerSignalHandlers(async () => {
  console.log('\n🔮 Shutting down gracefully...');
  await performGracefulShutdown({
    closeables: [
      { name: 'database', close: () => { closeDb(); return Promise.resolve(); } }
    ]
  });
  removePidFile();
  console.log('👋 Oracle Nightly HTTP Server stopped.');
});

// Create Hono app
const app = new Hono();

// CORS middleware
app.use('*', cors());

// ============================================================================
// API Routes
// ============================================================================

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', server: 'oracle-nightly', port: PORT, oracleV2: 'connected' });
});

// Search
app.get('/api/search', async (c) => {
  const q = c.req.query('q');
  if (!q) {
    return c.json({ error: 'Missing query parameter: q' }, 400);
  }
  const type = c.req.query('type') || 'all';
  const limit = parseInt(c.req.query('limit') || '10');
  const offset = parseInt(c.req.query('offset') || '0');
  const mode = (c.req.query('mode') || 'hybrid') as 'hybrid' | 'fts' | 'vector';
  const project = c.req.query('project'); // Explicit project filter
  const cwd = c.req.query('cwd');         // Auto-detect project from cwd

  const result = await handleSearch(q, type, limit, offset, mode, project, cwd);
  return c.json({ ...result, query: q });
});

// Consult
app.get('/api/consult', async (c) => {
  const q = c.req.query('q');
  if (!q) {
    return c.json({ error: 'Missing query parameter: q (decision)' }, 400);
  }
  const context = c.req.query('context') || '';
  const result = await handleConsult(q, context);
  return c.json(result);
});

// Reflect
app.get('/api/reflect', (c) => {
  return c.json(handleReflect());
});

// Stats
app.get('/api/stats', (c) => {
  return c.json(handleStats(DB_PATH));
});

// Logs
app.get('/api/logs', (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');
    const logs = db.select({
      query: searchLog.query,
      type: searchLog.type,
      mode: searchLog.mode,
      results_count: searchLog.resultsCount,
      search_time_ms: searchLog.searchTimeMs,
      created_at: searchLog.createdAt,
      project: searchLog.project
    })
      .from(searchLog)
      .orderBy(desc(searchLog.createdAt))
      .limit(limit)
      .all();
    return c.json({ logs, total: logs.length });
  } catch (e) {
    return c.json({ logs: [], error: 'Log table not found' });
  }
});

// Get document by ID (uses raw SQL for FTS JOIN)
app.get('/api/doc/:id', (c) => {
  const docId = c.req.param('id');
  try {
    // Must use raw SQL for FTS JOIN (Drizzle doesn't support virtual tables)
    const row = sqlite.prepare(`
      SELECT d.id, d.type, d.source_file, d.concepts, d.project, f.content
      FROM oracle_documents d
      JOIN oracle_fts f ON d.id = f.id
      WHERE d.id = ?
    `).get(docId) as any;

    if (!row) {
      return c.json({ error: 'Document not found' }, 404);
    }

    return c.json({
      id: row.id,
      type: row.type,
      content: row.content,
      source_file: row.source_file,
      concepts: JSON.parse(row.concepts || '[]'),
      project: row.project
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// List documents
app.get('/api/list', (c) => {
  const type = c.req.query('type') || 'all';
  const limit = parseInt(c.req.query('limit') || '10');
  const offset = parseInt(c.req.query('offset') || '0');
  const group = c.req.query('group') !== 'false';

  return c.json(handleList(type, limit, offset, group));
});

// Graph
app.get('/api/graph', (c) => {
  return c.json(handleGraph());
});

// Context
app.get('/api/context', (c) => {
  const cwd = c.req.query('cwd');
  return c.json(handleContext(cwd));
});

// File - supports cross-repo access via ghq project paths
app.get('/api/file', async (c) => {
  const filePath = c.req.query('path');
  const project = c.req.query('project'); // ghq-style path: github.com/owner/repo

  if (!filePath) {
    return c.json({ error: 'Missing path parameter' }, 400);
  }

  try {
    // Determine base path: ghq root + project, or local REPO_ROOT
    // Detect GHQ_ROOT dynamically (no hardcoding)
    let GHQ_ROOT = process.env.GHQ_ROOT;
    if (!GHQ_ROOT) {
      try {
        const proc = Bun.spawnSync(['ghq', 'root']);
        GHQ_ROOT = proc.stdout.toString().trim();
      } catch {
        // Fallback: derive from REPO_ROOT (assume ghq structure)
        // REPO_ROOT is like /path/to/github.com/owner/repo
        // GHQ_ROOT would be /path/to
        const match = REPO_ROOT.match(/^(.+?)\/github\.com\//);
        GHQ_ROOT = match ? match[1] : path.dirname(path.dirname(path.dirname(REPO_ROOT)));
      }
    }
    let basePath: string;

    if (project) {
      // Cross-repo: use ghq path
      basePath = path.join(GHQ_ROOT, project);
    } else {
      // Local: use current repo
      basePath = REPO_ROOT;
    }

    const fullPath = path.join(basePath, filePath);

    // Security: resolve symlinks and verify path is within allowed bounds
    let realPath: string;
    try {
      realPath = fs.realpathSync(fullPath);
    } catch {
      realPath = path.resolve(fullPath);
    }

    // Allow paths within GHQ_ROOT (for cross-repo) or REPO_ROOT (for local)
    const realGhqRoot = fs.realpathSync(GHQ_ROOT);
    const realRepoRoot = fs.realpathSync(REPO_ROOT);

    if (!realPath.startsWith(realGhqRoot) && !realPath.startsWith(realRepoRoot)) {
      return c.json({ error: 'Invalid path: outside allowed bounds' }, 400);
    }

    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      return c.text(content);
    } else {
      return c.text('File not found', 404);
    }
  } catch (e: any) {
    return c.text(e.message, 500);
  }
});

// ============================================================================
// Dashboard Routes
// ============================================================================

app.get('/api/dashboard', (c) => c.json(handleDashboardSummary()));
app.get('/api/dashboard/summary', (c) => c.json(handleDashboardSummary()));

app.get('/api/dashboard/activity', (c) => {
  const days = parseInt(c.req.query('days') || '7');
  return c.json(handleDashboardActivity(days));
});

app.get('/api/dashboard/growth', (c) => {
  const period = c.req.query('period') || 'week';
  return c.json(handleDashboardGrowth(period));
});

// Session stats endpoint - tracks activity from DB (includes MCP usage)
app.get('/api/session/stats', (c) => {
  const since = c.req.query('since');
  const sinceTime = since ? parseInt(since) : Date.now() - 24 * 60 * 60 * 1000; // Default 24h

  const searches = db.select({ count: sql<number>`count(*)` })
    .from(searchLog)
    .where(gt(searchLog.createdAt, sinceTime))
    .get();

  const consultations = db.select({ count: sql<number>`count(*)` })
    .from(consultLog)
    .where(gt(consultLog.createdAt, sinceTime))
    .get();

  const learnings = db.select({ count: sql<number>`count(*)` })
    .from(learnLog)
    .where(gt(learnLog.createdAt, sinceTime))
    .get();

  return c.json({
    searches: searches?.count || 0,
    consultations: consultations?.count || 0,
    learnings: learnings?.count || 0,
    since: sinceTime
  });
});

// ============================================================================
// Thread Routes
// ============================================================================

// List threads
app.get('/api/threads', (c) => {
  const status = c.req.query('status') as any;
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  const threadList = listThreads({ status, limit, offset });
  return c.json({
    threads: threadList.threads.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      message_count: getMessages(t.id).length,
      created_at: new Date(t.createdAt).toISOString(),
      issue_url: t.issueUrl
    })),
    total: threadList.total
  });
});

// Create thread / send message
app.post('/api/thread', async (c) => {
  try {
    const data = await c.req.json();
    if (!data.message) {
      return c.json({ error: 'Missing required field: message' }, 400);
    }
    const result = await handleThreadMessage({
      message: data.message,
      threadId: data.thread_id,
      title: data.title,
      role: data.role || 'human'
    });
    return c.json({
      thread_id: result.threadId,
      message_id: result.messageId,
      status: result.status,
      oracle_response: result.oracleResponse,
      issue_url: result.issueUrl
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Get thread by ID
app.get('/api/thread/:id', (c) => {
  const threadId = parseInt(c.req.param('id'), 10);
  if (isNaN(threadId)) {
    return c.json({ error: 'Invalid thread ID' }, 400);
  }

  const threadData = getFullThread(threadId);
  if (!threadData) {
    return c.json({ error: 'Thread not found' }, 404);
  }

  return c.json({
    thread: {
      id: threadData.thread.id,
      title: threadData.thread.title,
      status: threadData.thread.status,
      created_at: new Date(threadData.thread.createdAt).toISOString(),
      issue_url: threadData.thread.issueUrl
    },
    messages: threadData.messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      author: m.author,
      principles_found: m.principlesFound,
      patterns_found: m.patternsFound,
      created_at: new Date(m.createdAt).toISOString()
    }))
  });
});

// Update thread status
app.patch('/api/thread/:id/status', async (c) => {
  const threadId = parseInt(c.req.param('id'), 10);
  try {
    const data = await c.req.json();
    if (!data.status) {
      return c.json({ error: 'Missing required field: status' }, 400);
    }
    updateThreadStatus(threadId, data.status);
    return c.json({ success: true, thread_id: threadId, status: data.status });
  } catch (e) {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
});

// ============================================================================
// Decision Routes
// ============================================================================

// List decisions
app.get('/api/decisions', (c) => {
  const status = c.req.query('status') as any;
  const project = c.req.query('project');
  const tagsRaw = c.req.query('tags');
  const tags = tagsRaw ? tagsRaw.split(',') : undefined;
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  const result = listDecisions({ status, project, tags, limit, offset });
  return c.json({
    decisions: result.decisions.map(d => ({
      id: d.id,
      title: d.title,
      status: d.status,
      context: d.context,
      decision: d.decision,
      project: d.project,
      tags: d.tags,
      created_at: new Date(d.createdAt).toISOString(),
      updated_at: new Date(d.updatedAt).toISOString(),
      decided_at: d.decidedAt ? new Date(d.decidedAt).toISOString() : null,
      decided_by: d.decidedBy
    })),
    total: result.total,
    counts: getDecisionCounts()
  });
});

// Get single decision
app.get('/api/decisions/:id', (c) => {
  const decisionId = parseInt(c.req.param('id'), 10);
  const decision = getDecision(decisionId);

  if (!decision) {
    return c.json({ error: 'Decision not found' }, 404);
  }

  return c.json({
    id: decision.id,
    title: decision.title,
    status: decision.status,
    context: decision.context,
    options: decision.options,
    decision: decision.decision,
    rationale: decision.rationale,
    project: decision.project,
    tags: decision.tags,
    created_at: new Date(decision.createdAt).toISOString(),
    updated_at: new Date(decision.updatedAt).toISOString(),
    decided_at: decision.decidedAt ? new Date(decision.decidedAt).toISOString() : null,
    decided_by: decision.decidedBy
  });
});

// Create decision
app.post('/api/decisions', async (c) => {
  try {
    const data = await c.req.json();
    if (!data.title) {
      return c.json({ error: 'Missing required field: title' }, 400);
    }
    const decision = createDecision({
      title: data.title,
      context: data.context,
      options: data.options,
      tags: data.tags,
      project: data.project
    });
    return c.json({
      id: decision.id,
      title: decision.title,
      status: decision.status,
      created_at: new Date(decision.createdAt).toISOString()
    }, 201);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Update decision
app.patch('/api/decisions/:id', async (c) => {
  const decisionId = parseInt(c.req.param('id'), 10);
  try {
    const data = await c.req.json();
    const decision = updateDecision({
      id: decisionId,
      title: data.title,
      context: data.context,
      options: data.options,
      decision: data.decision,
      rationale: data.rationale,
      tags: data.tags,
      status: data.status,
      decidedBy: data.decided_by
    });

    if (!decision) {
      return c.json({ error: 'Decision not found' }, 404);
    }

    return c.json({
      id: decision.id,
      title: decision.title,
      status: decision.status,
      updated_at: new Date(decision.updatedAt).toISOString()
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Invalid request'
    }, 400);
  }
});

// Transition decision status
app.post('/api/decisions/:id/transition', async (c) => {
  const decisionId = parseInt(c.req.param('id'), 10);
  try {
    const data = await c.req.json();
    if (!data.status) {
      return c.json({ error: 'Missing required field: status' }, 400);
    }
    const decision = transitionStatus(decisionId, data.status, data.decided_by);

    if (!decision) {
      return c.json({ error: 'Decision not found' }, 404);
    }

    return c.json({
      id: decision.id,
      title: decision.title,
      status: decision.status,
      decided_at: decision.decidedAt ? new Date(decision.decidedAt).toISOString() : null,
      decided_by: decision.decidedBy
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Invalid request'
    }, 400);
  }
});

// ============================================================================
// Supersede Log Routes (Issue #18, #19)
// ============================================================================

// List supersessions with optional filters
app.get('/api/supersede', (c) => {
  const project = c.req.query('project');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  // Build where clause using Drizzle
  const whereClause = project ? eq(supersedeLog.project, project) : undefined;

  // Get total count using Drizzle
  const countResult = db.select({ total: sql<number>`count(*)` })
    .from(supersedeLog)
    .where(whereClause)
    .get();
  const total = countResult?.total || 0;

  // Get logs using Drizzle
  const logs = db.select()
    .from(supersedeLog)
    .where(whereClause)
    .orderBy(desc(supersedeLog.supersededAt))
    .limit(limit)
    .offset(offset)
    .all();

  return c.json({
    supersessions: logs.map(log => ({
      id: log.id,
      old_path: log.oldPath,
      old_id: log.oldId,
      old_title: log.oldTitle,
      old_type: log.oldType,
      new_path: log.newPath,
      new_id: log.newId,
      new_title: log.newTitle,
      reason: log.reason,
      superseded_at: new Date(log.supersededAt).toISOString(),
      superseded_by: log.supersededBy,
      project: log.project
    })),
    total,
    limit,
    offset
  });
});

// Get supersede chain for a document (what superseded what)
app.get('/api/supersede/chain/:path', (c) => {
  const docPath = decodeURIComponent(c.req.param('path'));

  // Find all supersessions where this doc was old or new using Drizzle
  const asOld = db.select()
    .from(supersedeLog)
    .where(eq(supersedeLog.oldPath, docPath))
    .orderBy(supersedeLog.supersededAt)
    .all();

  const asNew = db.select()
    .from(supersedeLog)
    .where(eq(supersedeLog.newPath, docPath))
    .orderBy(supersedeLog.supersededAt)
    .all();

  return c.json({
    superseded_by: asOld.map(log => ({
      new_path: log.newPath,
      reason: log.reason,
      superseded_at: new Date(log.supersededAt).toISOString()
    })),
    supersedes: asNew.map(log => ({
      old_path: log.oldPath,
      reason: log.reason,
      superseded_at: new Date(log.supersededAt).toISOString()
    }))
  });
});

// Log a new supersession
app.post('/api/supersede', async (c) => {
  try {
    const data = await c.req.json();
    if (!data.old_path) {
      return c.json({ error: 'Missing required field: old_path' }, 400);
    }

    const result = db.insert(supersedeLog).values({
      oldPath: data.old_path,
      oldId: data.old_id || null,
      oldTitle: data.old_title || null,
      oldType: data.old_type || null,
      newPath: data.new_path || null,
      newId: data.new_id || null,
      newTitle: data.new_title || null,
      reason: data.reason || null,
      supersededAt: Date.now(),
      supersededBy: data.superseded_by || 'user',
      project: data.project || null
    }).run();

    return c.json({
      id: result.lastInsertRowid,
      message: 'Supersession logged'
    }, 201);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// ============================================================================
// Trace Routes - Discovery journey visualization
// ============================================================================

app.get('/api/traces', (c) => {
  const query = c.req.query('query');
  const status = c.req.query('status');
  const project = c.req.query('project');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const result = listTraces({
    query: query || undefined,
    status: status as 'raw' | 'reviewed' | 'distilled' | undefined,
    project: project || undefined,
    limit,
    offset
  });

  return c.json(result);
});

app.get('/api/traces/:id', (c) => {
  const traceId = c.req.param('id');
  const trace = getTrace(traceId);

  if (!trace) {
    return c.json({ error: 'Trace not found' }, 404);
  }

  return c.json(trace);
});

app.get('/api/traces/:id/chain', (c) => {
  const traceId = c.req.param('id');
  const direction = c.req.query('direction') as 'up' | 'down' | 'both' || 'both';

  const chain = getTraceChain(traceId, direction);
  return c.json(chain);
});

// Link traces: POST /api/traces/:prevId/link { nextId: "..." }
app.post('/api/traces/:prevId/link', async (c) => {
  try {
    const prevId = c.req.param('prevId');
    const { nextId } = await c.req.json();

    if (!nextId) {
      return c.json({ error: 'Missing nextId in request body' }, 400);
    }

    const { linkTraces } = await import('./trace/handler.js');
    const result = linkTraces(prevId, nextId);

    if (!result.success) {
      return c.json({ error: result.message }, 400);
    }

    return c.json(result);
  } catch (err) {
    console.error('Link traces error:', err);
    return c.json({ error: 'Failed to link traces' }, 500);
  }
});

// Unlink trace: DELETE /api/traces/:id/link?direction=prev|next
app.delete('/api/traces/:id/link', async (c) => {
  try {
    const traceId = c.req.param('id');
    const direction = c.req.query('direction') as 'prev' | 'next';

    if (!direction || !['prev', 'next'].includes(direction)) {
      return c.json({ error: 'Missing or invalid direction (prev|next)' }, 400);
    }

    const { unlinkTraces } = await import('./trace/handler.js');
    const result = unlinkTraces(traceId, direction);

    if (!result.success) {
      return c.json({ error: result.message }, 400);
    }

    return c.json(result);
  } catch (err) {
    console.error('Unlink traces error:', err);
    return c.json({ error: 'Failed to unlink traces' }, 500);
  }
});

// Get trace linked chain: GET /api/traces/:id/linked-chain
app.get('/api/traces/:id/linked-chain', async (c) => {
  try {
    const traceId = c.req.param('id');
    const { getTraceLinkedChain } = await import('./trace/handler.js');
    const result = getTraceLinkedChain(traceId);
    return c.json(result);
  } catch (err) {
    console.error('Get linked chain error:', err);
    return c.json({ error: 'Failed to get linked chain' }, 500);
  }
});

// ============================================================================
// Learn Route
// ============================================================================

app.post('/api/learn', async (c) => {
  try {
    const data = await c.req.json();
    if (!data.pattern) {
      return c.json({ error: 'Missing required field: pattern' }, 400);
    }
    const result = handleLearn(
      data.pattern,
      data.source,
      data.concepts,
      data.origin,   // 'mother' | 'arthur' | 'volt' | 'human' (null = universal)
      data.project,  // ghq-style project path (null = universal)
      data.cwd       // Auto-detect project from cwd
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Arthur AI chat endpoint
app.post('/api/ask', async (c) => {
  try {
    const data = await c.req.json();
    if (!data.question) {
      return c.json({ error: 'Missing required field: question' }, 400);
    }
    const consultResult = await handleConsult(data.question, data.context || '');
    return c.json({
      response: consultResult.guidance || 'I found some relevant information but couldn\'t formulate a specific response.',
      principles: consultResult.principles?.length || 0,
      patterns: consultResult.patterns?.length || 0
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// ============================================================================
// Legacy HTML UIs
// ============================================================================

app.get('/legacy/arthur', (c) => {
  const content = fs.readFileSync(ARTHUR_UI_PATH, 'utf-8');
  return c.html(content);
});

app.get('/legacy/oracle', (c) => {
  const content = fs.readFileSync(UI_PATH, 'utf-8');
  return c.html(content);
});

app.get('/legacy/dashboard', (c) => {
  const content = fs.readFileSync(DASHBOARD_PATH, 'utf-8');
  return c.html(content);
});

// ============================================================================
// Static Files + SPA Fallback
// ============================================================================

// Serve static files from frontend/dist (use absolute path)
app.use('/*', serveStatic({ root: FRONTEND_DIST }));

// SPA fallback - serve index.html for unmatched routes
app.get('*', (c) => {
  const indexPath = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf-8');
    return c.html(content);
  }
  // Fallback to Arthur UI if no build exists
  const content = fs.readFileSync(ARTHUR_UI_PATH, 'utf-8');
  return c.html(content);
});

// ============================================================================
// Start Server
// ============================================================================

console.log(`
🔮 Oracle Nightly HTTP Server running! (Hono.js)

   URL: http://localhost:${PORT}

   Endpoints:
   - GET  /api/health          Health check
   - GET  /api/search?q=...    Search Oracle knowledge
   - GET  /api/list            Browse all documents
   - GET  /api/consult?q=...   Get guidance on decision
   - GET  /api/reflect         Random wisdom
   - GET  /api/stats           Database statistics
   - GET  /api/graph           Knowledge graph data
   - GET  /api/context         Project context (ghq format)
   - POST /api/learn           Add new pattern/learning
   - POST /api/ask             Arthur AI chat

   Forum:
   - GET  /api/threads         List threads
   - GET  /api/thread/:id      Get thread
   - POST /api/thread          Send message

   Decisions:
   - GET  /api/decisions       List decisions
   - GET  /api/decisions/:id   Get decision
   - POST /api/decisions       Create decision
   - PATCH /api/decisions/:id  Update decision

   Supersede Log:
   - GET  /api/supersede       List supersessions
   - GET  /api/supersede/chain/:path  Document lineage
   - POST /api/supersede       Log supersession
`);

export default {
  port: Number(PORT),
  fetch: app.fetch,
};
