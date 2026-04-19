/**
 * OracleNet proxy routes (Elysia) — feed, oracles, presence, status
 */

import { Elysia, t } from 'elysia';
import { ORACLENET_DEFAULT_URL } from '../const.ts';

const ORACLENET_URL = process.env.ORACLENET_URL || ORACLENET_DEFAULT_URL;

export const oraclenetRoutes = new Elysia({ prefix: '/api/oraclenet' })
  .get('/feed', async ({ query, set }) => {
    const sort = query.sort ?? '-created';
    const limit = query.limit ?? '20';
    const expand = 'author';
    try {
      const res = await fetch(
        `${ORACLENET_URL}/api/collections/posts/records?sort=${sort}&perPage=${limit}&expand=${expand}`
      );
      if (!res.ok) { set.status = 502; return { error: 'OracleNet unavailable' }; }
      return await res.json();
    } catch {
      set.status = 502;
      return { error: 'OracleNet unreachable' };
    }
  }, {
    query: t.Object({
      sort: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
  })
  .get('/oracles', async ({ query, set }) => {
    const limit = query.limit ?? '50';
    try {
      const res = await fetch(
        `${ORACLENET_URL}/api/collections/oracles/records?perPage=${limit}&sort=-karma`
      );
      if (!res.ok) { set.status = 502; return { error: 'OracleNet unavailable' }; }
      return await res.json();
    } catch {
      set.status = 502;
      return { error: 'OracleNet unreachable' };
    }
  }, {
    query: t.Object({ limit: t.Optional(t.String()) }),
  })
  .get('/presence', async ({ set }) => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    try {
      const res = await fetch(
        `${ORACLENET_URL}/api/collections/heartbeats/records?filter=(created>='${fiveMinAgo}')&expand=oracle&sort=-created&perPage=50`
      );
      if (!res.ok) { set.status = 502; return { error: 'OracleNet unavailable' }; }
      return await res.json();
    } catch {
      set.status = 502;
      return { error: 'OracleNet unreachable' };
    }
  })
  .get('/status', async () => {
    try {
      const res = await fetch(`${ORACLENET_URL}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return { online: res.ok, url: ORACLENET_URL };
    } catch {
      return { online: false, url: ORACLENET_URL };
    }
  });
