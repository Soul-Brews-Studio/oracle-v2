/**
 * #926 short-term fix: POST /api/vault/sync route wiring.
 * Uses the createVaultSyncRoute factory so migrate + spawn can be stubbed.
 */

import { describe, it, expect, mock } from 'bun:test';
import { Elysia } from 'elysia';
import { createVaultSyncRoute } from '../sync.ts';
import type { MigrateResult } from '../../../vault/migrate.ts';

const emptyMigrate: MigrateResult = {
  reposFound: 0,
  filesCopied: 0,
  repos: [],
  skipped: [],
  symlinked: [],
};

function post(app: Elysia, body: unknown) {
  return app.handle(
    new Request('http://localhost/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /sync', () => {
  it('dryRun=true passes through to migrate and never spawns reindex', async () => {
    const migrate = mock(() => ({ ...emptyMigrate, reposFound: 2, filesCopied: 5 }));
    const spawnIndexer = mock(() => {});
    const app = new Elysia().use(createVaultSyncRoute({ migrate, spawnIndexer }));

    const res = await post(app, { dryRun: true, reindex: true });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.reindex).toBe(false);
    expect(body.migrate.filesCopied).toBe(5);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(migrate.mock.calls[0]?.[0]).toEqual({ dryRun: true });
    expect(spawnIndexer).not.toHaveBeenCalled();
  });

  it('reindex=true spawns indexer only when files were actually copied', async () => {
    const migrate = mock(() => ({ ...emptyMigrate, reposFound: 3, filesCopied: 42 }));
    const spawnIndexer = mock(() => {});
    const app = new Elysia().use(createVaultSyncRoute({ migrate, spawnIndexer }));

    const res = await post(app, { reindex: true });
    const body = (await res.json()) as any;

    expect(body.ok).toBe(true);
    expect(body.reindex).toBe(true);
    expect(spawnIndexer).toHaveBeenCalledTimes(1);
  });

  it('reindex=true skips spawn when filesCopied=0', async () => {
    const migrate = mock(() => emptyMigrate);
    const spawnIndexer = mock(() => {});
    const app = new Elysia().use(createVaultSyncRoute({ migrate, spawnIndexer }));

    const res = await post(app, { reindex: true });
    const body = (await res.json()) as any;

    expect(body.ok).toBe(true);
    expect(body.reindex).toBe(false);
    expect(spawnIndexer).not.toHaveBeenCalled();
  });

  it('surfaces migrate() errors as 500', async () => {
    const migrate = mock(() => {
      throw new Error('Vault not initialized. Run vault:init first.');
    });
    const spawnIndexer = mock(() => {});
    const app = new Elysia().use(createVaultSyncRoute({ migrate, spawnIndexer }));

    const res = await post(app, {});
    const body = (await res.json()) as any;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Vault not initialized');
  });
});
