/**
 * Oracle v2 HTTP Server
 *
 * Web viewer for Oracle knowledge base.
 * Exposes same functionality as MCP but via HTTP.
 *
 * Endpoints:
 * - GET /health          - Health check
 * - GET /search?q=...    - Search Oracle knowledge
 * - GET /list            - Browse all documents (no query needed)
 * - GET /consult?q=...   - Get guidance on decision
 * - GET /reflect         - Random wisdom
 * - GET /stats           - Database statistics
 * - GET /graph           - Knowledge graph data
 * - GET /context?cwd=... - Project context from ghq path
 * - POST /learn          - Add new pattern/learning
 */

import http from 'http';
import url from 'url';
import fs from 'fs';
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
  db,
  initLoggingTables,
  closeDb
} from './server/db.js';

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

import path from 'path';

// Initialize logging tables on startup
try {
  initLoggingTables();
} catch (e) {
  console.error('Failed to initialize logging tables:', e);
}

// Configure process lifecycle management
const dataDir = path.join(import.meta.dirname || __dirname, '..');
configure({ dataDir });

// Write PID file for process tracking
writePidFile({ port: Number(PORT), name: 'oracle-http' });

// Register graceful shutdown handlers
registerSignalHandlers(async () => {
  console.log('\n🔮 Shutting down gracefully...');
  await performGracefulShutdown({
    closeables: [
      { name: 'database', close: () => { closeDb(); return Promise.resolve(); } }
    ]
  });
  removePidFile();
  console.log('👋 Oracle v2 HTTP Server stopped.');
});

/**
 * HTTP request handler
 */
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    let result: any;

    // POST /thread - Send message to thread
    if (pathname === '/thread' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          if (!data.message) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing required field: message' }));
            return;
          }
          const result = await handleThreadMessage({
            message: data.message,
            threadId: data.thread_id,
            title: data.title,
            role: data.role || 'human'
          });
          res.end(JSON.stringify({
            thread_id: result.threadId,
            message_id: result.messageId,
            status: result.status,
            oracle_response: result.oracleResponse,
            issue_url: result.issueUrl
          }, null, 2));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      });
      return;
    }

    // GET /thread/:id - Get thread with messages
    if (pathname?.startsWith('/thread/') && req.method === 'GET') {
      const threadId = parseInt(pathname.replace('/thread/', ''), 10);
      if (isNaN(threadId)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid thread ID' }));
        return;
      }
      const threadData = getFullThread(threadId);
      if (!threadData) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Thread not found' }));
        return;
      }
      res.end(JSON.stringify({
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
      }, null, 2));
      return;
    }

    // PATCH /thread/:id/status - Update thread status
    if (pathname?.match(/^\/thread\/\d+\/status$/) && req.method === 'PATCH') {
      const threadId = parseInt(pathname.split('/')[2], 10);
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!data.status) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing required field: status' }));
            return;
          }
          updateThreadStatus(threadId, data.status);
          res.end(JSON.stringify({ success: true, thread_id: threadId, status: data.status }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // POST /learn
    if (pathname === '/learn' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!data.pattern) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing required field: pattern' }));
            return;
          }
          const result = handleLearn(data.pattern, data.source, data.concepts);
          res.end(JSON.stringify(result, null, 2));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      });
      return;
    }

    // ========================================================================
    // Decision Endpoints
    // ========================================================================

    // GET /decisions - List decisions with filters
    if (pathname === '/decisions' && req.method === 'GET') {
      const result = listDecisions({
        status: query.status as any,
        project: query.project as string,
        tags: query.tags ? (query.tags as string).split(',') : undefined,
        limit: parseInt(query.limit as string) || 20,
        offset: parseInt(query.offset as string) || 0
      });
      res.end(JSON.stringify({
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
      }, null, 2));
      return;
    }

    // GET /decisions/:id - Get single decision
    if (pathname?.match(/^\/decisions\/\d+$/) && req.method === 'GET') {
      const decisionId = parseInt(pathname.split('/')[2], 10);
      const decision = getDecision(decisionId);
      if (!decision) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Decision not found' }));
        return;
      }
      res.end(JSON.stringify({
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
      }, null, 2));
      return;
    }

    // POST /decisions - Create new decision
    if (pathname === '/decisions' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!data.title) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing required field: title' }));
            return;
          }
          const decision = createDecision({
            title: data.title,
            context: data.context,
            options: data.options,
            tags: data.tags,
            project: data.project
          });
          res.statusCode = 201;
          res.end(JSON.stringify({
            id: decision.id,
            title: decision.title,
            status: decision.status,
            created_at: new Date(decision.createdAt).toISOString()
          }, null, 2));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      });
      return;
    }

    // PATCH /decisions/:id - Update decision
    if (pathname?.match(/^\/decisions\/\d+$/) && req.method === 'PATCH') {
      const decisionId = parseInt(pathname.split('/')[2], 10);
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
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
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Decision not found' }));
            return;
          }
          res.end(JSON.stringify({
            id: decision.id,
            title: decision.title,
            status: decision.status,
            updated_at: new Date(decision.updatedAt).toISOString()
          }, null, 2));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Invalid request'
          }));
        }
      });
      return;
    }

    // POST /decisions/:id/transition - Transition status
    if (pathname?.match(/^\/decisions\/\d+\/transition$/) && req.method === 'POST') {
      const decisionId = parseInt(pathname.split('/')[2], 10);
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!data.status) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing required field: status' }));
            return;
          }
          const decision = transitionStatus(decisionId, data.status, data.decided_by);
          if (!decision) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Decision not found' }));
            return;
          }
          res.end(JSON.stringify({
            id: decision.id,
            title: decision.title,
            status: decision.status,
            decided_at: decision.decidedAt ? new Date(decision.decidedAt).toISOString() : null,
            decided_by: decision.decidedBy
          }, null, 2));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Invalid request'
          }));
        }
      });
      return;
    }

    switch (pathname) {
      case '/':
        // Serve Arthur chat UI at root (per Spec 050)
        res.setHeader('Content-Type', 'text/html');
        res.end(fs.readFileSync(ARTHUR_UI_PATH, 'utf-8'));
        return;

      case '/oracle':
        // Serve Oracle Knowledge Base UI
        res.setHeader('Content-Type', 'text/html');
        res.end(fs.readFileSync(UI_PATH, 'utf-8'));
        return;

      case '/arthur':
        // Serve Arthur chat UI
        res.setHeader('Content-Type', 'text/html');
        res.end(fs.readFileSync(ARTHUR_UI_PATH, 'utf-8'));
        return;

      case '/dashboard/ui':
        // Serve Dashboard UI
        res.setHeader('Content-Type', 'text/html');
        res.end(fs.readFileSync(DASHBOARD_PATH, 'utf-8'));
        return;

      case '/health':
        result = { status: 'ok', server: 'oracle-v2', port: PORT, oracleV2: 'connected' };
        break;

      case '/search':
        if (!query.q) {
          res.statusCode = 400;
          result = { error: 'Missing query parameter: q' };
        } else {
          const searchResult = handleSearch(
            query.q as string,
            (query.type as string) || 'all',
            parseInt(query.limit as string) || 10,
            parseInt(query.offset as string) || 0
          );
          result = {
            ...searchResult,
            query: query.q
          };
        }
        break;

      case '/consult':
        if (!query.q) {
          res.statusCode = 400;
          result = { error: 'Missing query parameter: q (decision)' };
        } else {
          result = handleConsult(
            query.q as string,
            (query.context as string) || ''
          );
        }
        break;

      case '/reflect':
        result = handleReflect();
        break;

      case '/stats':
        result = handleStats(DB_PATH);
        break;

      case '/list':
        result = handleList(
          (query.type as string) || 'all',
          parseInt(query.limit as string) || 10,
          parseInt(query.offset as string) || 0,
          query.group !== 'false'  // default true, pass group=false to disable
        );
        break;

      case '/graph':
        result = handleGraph();
        break;

      // Dashboard endpoints
      case '/dashboard':
      case '/dashboard/summary':
        result = handleDashboardSummary();
        break;

      case '/dashboard/activity':
        result = handleDashboardActivity(
          parseInt(query.days as string) || 7
        );
        break;

      case '/dashboard/growth':
        result = handleDashboardGrowth(
          (query.period as string) || 'week'
        );
        break;

      case '/context':
        // Return project context from ghq-format path
        result = handleContext(query.cwd as string | undefined);
        break;

      case '/file':
        // Return full file content
        const filePath = query.path as string;
        if (!filePath) {
          result = { error: 'Missing path parameter' };
        } else {
          try {
            const fullPath = path.join(REPO_ROOT, filePath);

            // Security: resolve symlinks and verify path is within REPO_ROOT
            // This prevents path traversal attacks via symlinks
            let realPath: string;
            try {
              realPath = fs.realpathSync(fullPath);
            } catch {
              // File doesn't exist - use resolved path for bounds check
              realPath = path.resolve(fullPath);
            }

            // Get real REPO_ROOT path (in case it contains symlinks)
            const realRepoRoot = fs.realpathSync(REPO_ROOT);

            if (!realPath.startsWith(realRepoRoot)) {
              result = { error: 'Invalid path: outside repository bounds' };
            } else if (fs.existsSync(fullPath)) {
              const content = fs.readFileSync(fullPath, 'utf-8');
              result = { path: filePath, content };
            } else {
              result = { error: 'File not found' };
            }
          } catch (e: any) {
            result = { error: e.message };
          }
        }
        break;

      // Forum endpoints
      case '/threads':
        const threadList = listThreads({
          status: query.status as any,
          limit: parseInt(query.limit as string) || 20,
          offset: parseInt(query.offset as string) || 0
        });
        result = {
          threads: threadList.threads.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            message_count: getMessages(t.id).length,
            created_at: new Date(t.createdAt).toISOString(),
            issue_url: t.issueUrl
          })),
          total: threadList.total
        };
        break;

      default:
        res.statusCode = 404;
        result = {
          error: 'Not found',
          endpoints: [
            'GET /health - Health check',
            'GET /search?q=... - Search Oracle',
            'GET /list - Browse all documents',
            'GET /consult?q=... - Get guidance',
            'GET /reflect - Random wisdom',
            'GET /stats - Database stats',
            'GET /graph - Knowledge graph data',
            'GET /context?cwd=... - Project context from ghq path',
            'POST /learn - Add new pattern/learning',
            'GET /dashboard - Dashboard summary',
            'GET /dashboard/activity?days=7 - Recent activity',
            'GET /dashboard/growth?period=week - Growth over time',
            'GET /threads - List discussion threads',
            'GET /thread/:id - Get thread with messages',
            'POST /thread - Send message to thread (Oracle auto-responds)',
            'GET /decisions - List decisions',
            'GET /decisions/:id - Get single decision',
            'POST /decisions - Create decision',
            'PATCH /decisions/:id - Update decision',
            'POST /decisions/:id/transition - Transition status'
          ]
        };
    }

    res.end(JSON.stringify(result, null, 2));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }));
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`
🔮 Oracle v2 HTTP Server running!

   URL: http://localhost:${PORT}

   Endpoints:
   - GET /health          Health check
   - GET /search?q=...    Search Oracle knowledge
   - GET /list            Browse all documents
   - GET /consult?q=...   Get guidance on decision
   - GET /reflect         Random wisdom
   - GET /stats           Database statistics
   - GET /graph           Knowledge graph data
   - GET /context         Project context (ghq format)
   - POST /learn          Add new pattern/learning

   Examples:
   curl http://localhost:${PORT}/health
   curl http://localhost:${PORT}/search?q=nothing+deleted
   curl http://localhost:${PORT}/list?type=learning&limit=5
   curl http://localhost:${PORT}/consult?q=force+push
   curl http://localhost:${PORT}/reflect
   curl http://localhost:${PORT}/stats
   curl http://localhost:${PORT}/graph
   curl http://localhost:${PORT}/context
   curl -X POST http://localhost:${PORT}/learn -H "Content-Type: application/json" \\
     -d '{"pattern":"Always verify before destructive operations","concepts":["safety","git"]}'
`);
});

// Note: Graceful shutdown is handled by bun-process-manager's registerSignalHandlers()
