import { Elysia } from 'elysia';
import { DB_PATH } from '../../config.ts';
import { getSetting } from '../../db/index.ts';
import { handleStats, handleVectorStats } from '../../server/handlers.ts';

export const statsEndpoint = new Elysia().get('/stats', async () => {
  const stats = handleStats(DB_PATH);
  const vaultRepo = getSetting('vault_repo');
  let vectorStats = { vector: { enabled: false, count: 0, collection: 'oracle_knowledge' } };
  try {
    vectorStats = await handleVectorStats();
  } catch { /* vector unavailable */ }
  return { ...stats, ...vectorStats, vault_repo: vaultRepo };
}, {
  detail: {
    tags: ['health', 'nav:tools', 'order:50'],
    summary: 'Database and vector stats',
  },
});
