import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Subprocess } from 'bun';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASE_URL = 'http://localhost:47780';

let serverProcess: Subprocess | null = null;
let tempRoot = '';
let tempRepoRoot = '';
let tempDataDir = '';

async function waitForServer(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return true;
    } catch {
      // Server not ready yet.
    }
    await Bun.sleep(500);
  }
  return false;
}

describe('Knowledge route integration', () => {
  beforeAll(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arra-knowledge-test-'));
    tempRepoRoot = path.join(tempRoot, 'repo');
    tempDataDir = path.join(tempRoot, 'data');
    fs.mkdirSync(path.join(tempRepoRoot, 'ψ'), { recursive: true });
    fs.mkdirSync(tempDataDir, { recursive: true });

    serverProcess = Bun.spawn(['bun', 'run', 'src/server.ts'], {
      cwd: import.meta.dir.replace('/src/integration', ''),
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        ORACLE_PORT: '47780',
        ORACLE_REPO_ROOT: tempRepoRoot,
        ORACLE_DATA_DIR: tempDataDir,
      },
    });

    const ready = await waitForServer();
    if (!ready) {
      throw new Error('Knowledge test server failed to start');
    }
  }, 30_000);

  afterAll(() => {
    if (serverProcess) serverProcess.kill();
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('POST /api/learn persists the learning to storage and search', async () => {
    const unique = `knowledge-route-${Date.now()}`;
    const pattern = `[infra-health] ${unique}\nIntegration test learning payload`;

    const createRes = await fetch(`${BASE_URL}/api/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pattern,
        source: 'integration-test',
        concepts: ['integration', unique],
      }),
    });

    expect(createRes.status).toBe(200);
    const created = await createRes.json() as Record<string, string | boolean>;
    expect(created.success).toBe(true);
    expect(typeof created.file).toBe('string');
    expect(created.file as string).toContain('ψ/memory/learnings/');
    expect(typeof created.id).toBe('string');
    expect(created.id as string).toContain(unique);
    expect(created.ttl).toBe('7d');

    const filePath = path.join(tempRepoRoot, created.file as string);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toContain(unique);

    const searchRes = await fetch(`${BASE_URL}/api/search?q=${encodeURIComponent(unique)}`);
    expect(searchRes.status).toBe(200);
    const searchData = await searchRes.json() as { results: Array<{ id: string }> };
    expect(searchData.results.some((result) => result.id === created.id)).toBe(true);
  });
});
