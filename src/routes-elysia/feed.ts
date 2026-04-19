/**
 * Feed Routes (Elysia) — /api/feed (GET + POST), MAW_JS_URL integration
 *
 * Behavior parity with src/routes/feed.ts (Hono).
 * Both GET and POST require auth (mirrors the Hono /api/* middleware).
 */

import { Elysia, t } from 'elysia';
import fs from 'fs';
import os from 'os';
import { FEED_LOG } from '../config.ts';
import { SESSION_COOKIE_NAME, isAuthenticated } from './auth.ts';

const MAW_JS_URL = process.env.MAW_JS_URL || 'http://localhost:3456';

interface FeedEvent {
  timestamp: string;
  oracle: string;
  host: string;
  event: string;
  project: string;
  session_id: string;
  message: string;
  source: 'local' | 'maw-js';
}

export const feedApi = new Elysia()
  .onBeforeHandle(({ server, request, cookie, set }) => {
    const sessionValue = cookie[SESSION_COOKIE_NAME]?.value as string | undefined;
    if (!isAuthenticated(server, request, sessionValue)) {
      set.status = 401;
      return { error: 'Unauthorized', requiresAuth: true };
    }
  })
  .get('/api/feed', async ({ query, set }) => {
    try {
      const limit = Math.min(200, parseInt(query.limit || '50'));
      const oracle = query.oracle || undefined;
      const event = query.event || undefined;
      const since = query.since || undefined;

      let allEvents: FeedEvent[] = [];

      if (fs.existsSync(FEED_LOG)) {
        const raw = fs.readFileSync(FEED_LOG, 'utf-8').trim().split('\n').filter(Boolean);
        const localEvents: FeedEvent[] = raw.map(line => {
          const [ts, oracleName, host, eventType, project, rest] = line.split(' | ').map(s => s.trim());
          const [sessionId, ...msgParts] = (rest || '').split(' » ');
          return {
            timestamp: ts,
            oracle: oracleName,
            host,
            event: eventType,
            project,
            session_id: sessionId?.trim(),
            message: msgParts.join(' » ').trim(),
            source: 'local',
          };
        });
        allEvents.push(...localEvents);
      }

      try {
        const mawRes = await fetch(`${MAW_JS_URL}/api/feed?limit=100`, { signal: AbortSignal.timeout(2000) });
        if (mawRes.ok) {
          const mawData = await mawRes.json() as any;
          if (mawData.events && Array.isArray(mawData.events)) {
            const mawEvents: FeedEvent[] = mawData.events.map((e: any) => ({
              timestamp: e.timestamp || new Date(e.ts).toISOString().replace('T', ' ').slice(0, 19),
              oracle: e.oracle,
              host: e.host,
              event: e.event,
              project: e.project,
              session_id: e.sessionId,
              message: e.message,
              source: 'maw-js',
            }));
            allEvents.push(...mawEvents);
          }
        }
      } catch (mawError) {
        console.log('maw-js feed unavailable:', mawError);
      }

      if (oracle) allEvents = allEvents.filter(e => e.oracle === oracle);
      if (event) allEvents = allEvents.filter(e => e.event === event);
      if (since) allEvents = allEvents.filter(e => e.timestamp >= since);

      allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const total = allEvents.length;
      allEvents = allEvents.slice(0, limit);

      const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString().replace('T', ' ').slice(0, 19);
      const activeOracles = [...new Set(allEvents.filter(e => e.timestamp >= fiveMinAgo).map(e => e.oracle))];

      return { events: allEvents, total, active_oracles: activeOracles };
    } catch (e: any) {
      set.status = 500;
      return { error: e.message, events: [], total: 0 };
    }
  }, {
    query: t.Object({
      limit: t.Optional(t.String()),
      oracle: t.Optional(t.String()),
      event: t.Optional(t.String()),
      since: t.Optional(t.String()),
    }),
  })
  .post('/api/feed', async ({ body, set }) => {
    try {
      const b = body as {
        oracle?: string;
        event?: string;
        project?: string;
        session_id?: string;
        message?: string;
      };
      const { oracle, event, project, session_id, message } = b;

      if (!oracle || !event) {
        set.status = 400;
        return { error: 'Missing required fields: oracle, event' };
      }

      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const host = os.hostname();
      const line = `${timestamp} | ${oracle} | ${host} | ${event} | ${project || ''} | ${session_id || ''} » ${message || ''}\n`;

      fs.appendFileSync(FEED_LOG, line);
      return { success: true, timestamp };
    } catch (e: any) {
      set.status = 500;
      return { error: e.message };
    }
  }, {
    body: t.Unknown(),
  });
