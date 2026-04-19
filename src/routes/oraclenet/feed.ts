import { Elysia } from 'elysia';
import { FeedQuery, ORACLENET_URL } from './model.ts';

export const feedEndpoint = new Elysia().get('/feed', async ({ query, set }) => {
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
  query: FeedQuery,
  detail: {
    tags: ['oraclenet', 'nav:hidden'],
    summary: 'Proxy OracleNet feed records',
  },
});
