import { Elysia } from 'elysia';
import { ORACLENET_URL } from './model.ts';

export const presenceEndpoint = new Elysia().get('/presence', async ({ set }) => {
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
}, {
  detail: {
    tags: ['oraclenet', 'nav:hidden'],
    summary: 'Active oracle presence heartbeats',
  },
});
