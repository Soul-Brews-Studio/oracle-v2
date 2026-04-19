import { Elysia } from 'elysia';
import { OraclesQuery, ORACLENET_URL } from './model.ts';

export const oraclesEndpoint = new Elysia().get('/oracles', async ({ query, set }) => {
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
  query: OraclesQuery,
  detail: {
    tags: ['oraclenet', 'nav:hidden'],
    summary: 'Proxy OracleNet oracle records',
  },
});
