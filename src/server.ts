/**
 * Arra Oracle HTTP Server — Elysia (bun-native).
 *
 * Composes 15 route modules from src/routes-elysia/. Every module is its own
 * Elysia sub-app, nested one file per endpoint.
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { eq } from 'drizzle-orm';

import {
  configure,
  writePidFile,
  removePidFile,
  registerSignalHandlers,
  performGracefulShutdown,
} from './process-manager/index.ts';

import { PORT, ORACLE_DATA_DIR } from './config.ts';
import { MCP_SERVER_NAME } from './const.ts';
import { db, closeDb, indexingStatus } from './db/index.ts';

// Elysia sub-apps — one per cluster
import { authRoutes } from './routes-elysia/auth/index.ts';
import { settingsRoutes } from './routes-elysia/settings/index.ts';
import { feedRoutes } from './routes-elysia/feed/index.ts';
import { healthRoutes } from './routes-elysia/health/index.ts';
import { dashboardRoutes } from './routes-elysia/dashboard/index.ts';
import { searchRoutes } from './routes-elysia/search/index.ts';
import { knowledgeRoutes } from './routes-elysia/knowledge/index.ts';
import { supersedeRoutes } from './routes-elysia/supersede/index.ts';
import { forumApi } from './routes-elysia/forum/index.ts';
import { tracesApi } from './routes-elysia/traces/index.ts';
import { scheduleApi } from './routes-elysia/schedule/index.ts';
import { filesRouter } from './routes-elysia/files/index.ts';
import { pluginsRouter } from './routes-elysia/plugins/index.ts';
import { oraclenetRoutes } from './routes-elysia/oraclenet/index.ts';
import { sessionsRoutes } from './routes-elysia/sessions/index.ts';

import pkg from '../package.json' with { type: 'json' };

try {
  db.update(indexingStatus).set({ isIndexing: 0 }).where(eq(indexingStatus.id, 1)).run();
  console.log('🔮 Reset indexing status on startup');
} catch (e) {
  // table might not exist yet — fine on first boot
}

configure({ dataDir: ORACLE_DATA_DIR, pidFileName: 'oracle-http.pid' });
writePidFile({
  pid: process.pid,
  port: Number(PORT),
  startedAt: new Date().toISOString(),
  name: 'oracle-http',
});

registerSignalHandlers(async () => {
  console.log('\n🔮 Shutting down gracefully...');
  await performGracefulShutdown({
    resources: [{ close: () => { closeDb(); return Promise.resolve(); } }],
  });
  removePidFile();
  console.log('👋 Arra Oracle HTTP Server stopped.');
});

const DEFAULT_ALLOWED_ORIGINS = [
  'https://studio.buildwithoracle.com',
  'https://neo.buildwithoracle.com',
];
const envExtraOrigins = (process.env.ORACLE_CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const legacyOrigin = process.env.CORS_ORIGIN?.trim();
const ALLOWED_ORIGINS = [
  ...DEFAULT_ALLOWED_ORIGINS,
  ...envExtraOrigins,
  ...(legacyOrigin ? [legacyOrigin] : []),
];

function originAllowed(origin: string | undefined | null): string | null {
  if (!origin) return null;
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return origin;
  }
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return null;
}

// Private Network Access preflight (Chrome 117+). Must intercept OPTIONS
// before @elysiajs/cors, because the cors plugin answers preflights itself
// without emitting the `Access-Control-Allow-Private-Network` header that
// Chrome requires for https→localhost fetches.
const pnaMiddleware = new Elysia().onRequest(({ request }) => {
  if (
    request.method === 'OPTIONS' &&
    request.headers.get('access-control-request-private-network') === 'true'
  ) {
    const origin = originAllowed(request.headers.get('origin'));
    if (!origin) return;
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
        'Access-Control-Allow-Headers':
          request.headers.get('access-control-request-headers') ?? 'content-type',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }
});

const app = new Elysia()
  .use(pnaMiddleware)
  .use(
    cors({
      origin: (request) => {
        const origin = request.headers.get('origin');
        return originAllowed(origin) !== null;
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    }),
  )
  .onAfterHandle(({ set }) => {
    set.headers['X-Content-Type-Options'] = 'nosniff';
    set.headers['X-Frame-Options'] = 'DENY';
    set.headers['X-XSS-Protection'] = '1; mode=block';
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
  })
  .use(
    swagger({
      path: '/swagger',
      documentation: {
        info: {
          title: 'Arra Oracle API',
          version: pkg.version,
          description: 'HTTP API for the Arra Oracle MCP memory layer.',
        },
      },
    }),
  )
  .get('/', () => ({
    server: MCP_SERVER_NAME,
    version: pkg.version,
    status: 'ok',
    docs: '/swagger',
    api: '/api',
  }));

const modules = [
  authRoutes,
  settingsRoutes,
  feedRoutes,
  healthRoutes,
  dashboardRoutes,
  searchRoutes,
  knowledgeRoutes,
  supersedeRoutes,
  forumApi,
  tracesApi,
  scheduleApi,
  filesRouter,
  pluginsRouter,
  oraclenetRoutes,
  sessionsRoutes,
];

for (const mod of modules) app.use(mod as any);

console.log(`
🔮 Arra Oracle HTTP Server running! (Elysia)

   URL:     http://localhost:${PORT}
   Swagger: http://localhost:${PORT}/swagger
   Version: ${pkg.version}
`);

export default {
  port: Number(PORT),
  fetch: app.fetch,
};
