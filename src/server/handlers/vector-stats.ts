/**
 * Vector Stats Handler
 *
 * Get statistics for all vector store engines.
 */

import { getEmbeddingModels } from '../../vector/factory.ts';
import { ensureVectorStoreConnected } from '../../vector/factory.ts';

/**
 * Get vector store statistics for all registered engines
 */
export async function handleVectorStats(): Promise<{
  vector: { enabled: boolean; count: number; collection: string };
  vectors?: Array<{ key: string; model: string; collection: string; count: number; enabled: boolean }>;
}> {
  const timeout = parseInt(process.env.ORACLE_CHROMA_TIMEOUT || '5000', 10);
  const models = getEmbeddingModels();
  const engines: Array<{ key: string; model: string; collection: string; count: number; enabled: boolean }> = [];

  // Query all registered engines in parallel
  await Promise.all(
    Object.entries(models).map(async ([key, preset]) => {
      try {
        const store = await ensureVectorStoreConnected(key);
        const stats = await Promise.race([
          store.getStats(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          ),
        ]);
        engines.push({ key, model: preset.model, collection: preset.collection, count: stats.count, enabled: true });
      } catch (e) {
        // Engine not available or timeout
        console.debug(`Vector engine ${key} unavailable: ${e instanceof Error ? e.message : String(e)}`);
        engines.push({ key, model: preset.model, collection: preset.collection, count: 0, enabled: false });
      }
    })
  );

  // Primary = nomic (matches indexer default collection)
  const primary = engines.find(e => e.key === 'nomic') || engines[0];
  return {
    vector: {
      enabled: primary?.enabled ?? false,
      count: primary?.count ?? 0,
      collection: primary?.collection ?? 'oracle_knowledge'
    },
    vectors: engines,
  };
}
