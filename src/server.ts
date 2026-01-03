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
 * - POST /learn          - Add new pattern/learning
 */

import http from 'http';
import url from 'url';
import fs from 'fs';

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

import path from 'path';

// Initialize logging tables on startup
try {
  initLoggingTables();
} catch (e) {
  console.error('Failed to initialize logging tables:', e);
}

/**
 * HTTP request handler
 */
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
        result = { status: 'ok', server: 'oracle-v2', port: PORT };
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
            'POST /learn - Add new pattern/learning',
            'GET /dashboard - Dashboard summary',
            'GET /dashboard/activity?days=7 - Recent activity',
            'GET /dashboard/growth?period=week - Growth over time'
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
   - POST /learn          Add new pattern/learning

   Examples:
   curl http://localhost:${PORT}/health
   curl http://localhost:${PORT}/search?q=nothing+deleted
   curl http://localhost:${PORT}/list?type=learning&limit=5
   curl http://localhost:${PORT}/consult?q=force+push
   curl http://localhost:${PORT}/reflect
   curl http://localhost:${PORT}/stats
   curl http://localhost:${PORT}/graph
   curl -X POST http://localhost:${PORT}/learn -H "Content-Type: application/json" \\
     -d '{"pattern":"Always verify before destructive operations","concepts":["safety","git"]}'
`);
});

// Cleanup on exit
process.on('SIGINT', () => {
  closeDb();
  process.exit(0);
});
