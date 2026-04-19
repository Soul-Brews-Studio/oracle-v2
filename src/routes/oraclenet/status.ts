import { Elysia } from 'elysia';
import { ORACLENET_URL } from './model.ts';

export const statusEndpoint = new Elysia().get('/status', async () => {
  try {
    const res = await fetch(`${ORACLENET_URL}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return { online: res.ok, url: ORACLENET_URL };
  } catch {
    return { online: false, url: ORACLENET_URL };
  }
}, {
  detail: {
    tags: ['oraclenet', 'nav:hidden'],
    summary: 'OracleNet upstream health',
  },
});
