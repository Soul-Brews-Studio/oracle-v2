/**
 * Arra Oracle HTTP Server - Hono.js Version
 *
 * Modern routing with Hono.js on Bun runtime.
 * Routes split into modules under src/routes/.
 */

import { Hono } from 'hono';
import { timingSafeEqual, createHmac } from 'crypto';
import { cors } from 'hono/cors';
import { eq } from 'drizzle-orm';

import {
  configure,
  writePidFile,
  removePidFile,
  registerSignalHandlers,
  performGracefulShutdown,
} from './process-manager/index.ts';

import { PORT, ORACLE_DATA_DIR, MCP_AUTH_TOKEN } from './config.ts';
import { db, closeDb, indexingStatus } from './db/index.ts';

// Route modules
import { registerAuthRoutes } from './routes/auth.ts';
import { registerSettingsRoutes } from './routes/settings.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { registerSearchRoutes } from './routes/search.ts';
import { registerFeedRoutes } from './routes/feed.ts';
import { registerDashboardRoutes } from './routes/dashboard.ts';
import { registerForumRoutes } from './routes/forum.ts';
import { registerScheduleRoutes } from './routes/schedule.ts';
import { registerTraceRoutes } from './routes/traces.ts';
import { registerKnowledgeRoutes } from './routes/knowledge.ts';
import { registerSupersedeRoutes } from './routes/supersede.ts';
import { registerFileRoutes } from './routes/files.ts';
import { createMcpHandler } from './mcp-transport.ts';

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
configure({ dataDir: ORACLE_DATA_DIR, pidFileName: 'oracle-http.pid' });

// Write PID file for process tracking
writePidFile({ pid: process.pid, port: Number(PORT), startedAt: new Date().toISOString(), name: 'oracle-http' });

// Register graceful shutdown handlers
registerSignalHandlers(async () => {
  console.log('\n🔮 Shutting down gracefully...');
  await performGracefulShutdown({
    resources: [
      { close: () => { closeDb(); return Promise.resolve(); } }
    ]
  });
  removePidFile();
  console.log('👋 Arra Oracle HTTP Server stopped.');
});

// Create Hono app
const app = new Hono();

// CORS middleware — restrict to same-origin in production
app.use('*', cors({
  origin: (origin) => {
    // Allow same-origin (no origin header) and localhost variants
    if (!origin) return origin;
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return origin;
    }
    // In production, only allow configured origin
    const allowedOrigin = process.env.CORS_ORIGIN;
    if (allowedOrigin && origin === allowedOrigin) return origin;
    return null; // Reject unknown origins
  },
  credentials: true,
}));

// Security headers middleware
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// Register all route modules (order matters: auth middleware first)
registerAuthRoutes(app);
registerSettingsRoutes(app);
registerHealthRoutes(app);
registerSearchRoutes(app);
registerFeedRoutes(app);
registerDashboardRoutes(app);
registerForumRoutes(app);
registerScheduleRoutes(app);
registerTraceRoutes(app);
registerKnowledgeRoutes(app);
registerSupersedeRoutes(app);
registerFileRoutes(app);

// MCP Streamable HTTP endpoint — Bearer token auth, stateless per-request
app.all('/mcp', async (c) => {
  // Require MCP_AUTH_TOKEN to be set; reject all if not configured
  if (!MCP_AUTH_TOKEN) {
    return c.json({ error: 'MCP endpoint not configured (MCP_AUTH_TOKEN not set)' }, 401);
  }

  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  // Constant-time comparison via HMAC — avoids length oracle leak and
  // handles multi-byte tokens correctly (both digests are always 32 bytes).
  const _hmacKey = Buffer.alloc(32);
  const expectedHash = createHmac('sha256', _hmacKey).update(MCP_AUTH_TOKEN).digest();
  const providedHash = createHmac('sha256', _hmacKey).update(token).digest();
  const match = timingSafeEqual(expectedHash, providedHash);

  if (!match) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Add MCP-specific CORS headers
  c.header('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
  c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, mcp-session-id, mcp-protocol-version, Last-Event-ID');

  try {
    const response = await createMcpHandler(c.req.raw);
    return response;
  } catch (err) {
    console.error('[MCP] Handler error:', err);
    return c.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null },
      500,
    );
  }
});

// Startup banner
console.log(`
🔮 Arra Oracle HTTP Server running! (Hono.js)

   URL: http://localhost:${PORT}

   Endpoints:
   - GET  /api/health          Health check
   - GET  /api/search?q=...    Search Oracle knowledge
   - GET  /api/list            Browse all documents
   - GET  /api/reflect         Random wisdom
   - GET  /api/stats           Database statistics
   - GET  /api/graph           Knowledge graph data
   - GET  /api/map             Knowledge map 2D (hash-based layout)
   - GET  /api/map3d           Knowledge map 3D (real PCA from LanceDB embeddings)
   - GET  /api/context         Project context (ghq format)
   - POST /api/learn           Add new pattern/learning

   Forum:
   - GET  /api/threads         List threads
   - GET  /api/thread/:id      Get thread
   - POST /api/thread          Send message

   Supersede Log:
   - GET  /api/supersede       List supersessions
   - GET  /api/supersede/chain/:path  Document lineage
   - POST /api/supersede       Log supersession

   MCP (Remote):
   - ALL /mcp                  Streamable HTTP MCP endpoint
`);
console.log(MCP_AUTH_TOKEN ? '   🔑 MCP auth: configured' : '   ⚠️  MCP auth: NOT configured (/mcp will reject all requests)');

export default {
  port: Number(PORT),
  fetch: app.fetch,
};
