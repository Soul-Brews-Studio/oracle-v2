import { afterAll, describe, expect, test } from 'bun:test';
import type { Subprocess } from 'bun';
import fs from 'fs';
import os from 'os';
import path from 'path';

const LOCKOUT_BASE_URL = 'http://localhost:47781';
const TEST_TOKEN = 'test-bearer-token';
const TEST_PIN = '1234';

const spawnedProcesses = new Set<Subprocess>();
const tempDirs = new Set<string>();

function createTempEnvRoot(prefix: string): { repoRoot: string; dataDir: string } {
  const cleanupRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const repoRoot = path.join(cleanupRoot, 'repo');
  const dataDir = path.join(cleanupRoot, 'data');
  fs.mkdirSync(path.join(repoRoot, 'ψ'), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  tempDirs.add(cleanupRoot);
  return { repoRoot, dataDir };
}

async function waitForServer(baseUrl: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return true;
    } catch {
      // Server not ready yet.
    }
    await Bun.sleep(500);
  }
  return false;
}

afterAll(() => {
  for (const process of spawnedProcesses) {
    process.kill();
  }
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('OAuth hardening', () => {
  test('server startup rejects insecure non-loopback MCP_EXTERNAL_URL when OAuth is enabled', async () => {
    const { repoRoot, dataDir } = createTempEnvRoot('arra-oauth-config-test-');

    const serverProc = Bun.spawn(['bun', 'run', 'src/server.ts'], {
      cwd: import.meta.dir.replace('/src/integration', ''),
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        ORACLE_PORT: '47782',
        ORACLE_REPO_ROOT: repoRoot,
        ORACLE_DATA_DIR: dataDir,
        MCP_AUTH_TOKEN: TEST_TOKEN,
        MCP_OAUTH_PIN: TEST_PIN,
        MCP_EXTERNAL_URL: 'http://example.com',
      },
    });
    spawnedProcesses.add(serverProc);

    const exitCode = await serverProc.exited;
    expect(exitCode).not.toBe(0);

    const stderrText = serverProc.stderr ? await new Response(serverProc.stderr).text() : '';
    const stdoutText = serverProc.stdout ? await new Response(serverProc.stdout).text() : '';
    expect(`${stdoutText}\n${stderrText}`).toContain('MCP_EXTERNAL_URL must use HTTPS');
  }, 30_000);

  test('PIN lockout cannot be bypassed with spoofed forwarding headers', async () => {
    const { repoRoot, dataDir } = createTempEnvRoot('arra-oauth-lockout-test-');
    const serverProc = Bun.spawn(['bun', 'run', 'src/server.ts'], {
      cwd: import.meta.dir.replace('/src/integration', ''),
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        ORACLE_PORT: '47781',
        ORACLE_REPO_ROOT: repoRoot,
        ORACLE_DATA_DIR: dataDir,
        MCP_AUTH_TOKEN: TEST_TOKEN,
        MCP_OAUTH_PIN: TEST_PIN,
        MCP_EXTERNAL_URL: LOCKOUT_BASE_URL,
      },
    });
    spawnedProcesses.add(serverProc);

    const ready = await waitForServer(LOCKOUT_BASE_URL);
    if (!ready) {
      throw new Error('OAuth lockout test server failed to start');
    }

    const registerRes = await fetch(`${LOCKOUT_BASE_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        redirect_uris: ['http://localhost:9999/callback'],
        client_name: 'Lockout Test Client',
      }),
    });
    expect(registerRes.status).toBe(201);
    const client = await registerRes.json() as Record<string, string>;

    const authorizeUrl = new URL(`${LOCKOUT_BASE_URL}/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', client.client_id);
    authorizeUrl.searchParams.set('redirect_uri', 'http://localhost:9999/callback');
    authorizeUrl.searchParams.set('code_challenge', 'abc123');
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    const authorizeRes = await fetch(authorizeUrl.toString(), { redirect: 'manual' });
    expect(authorizeRes.status).toBe(302);
    const location = authorizeRes.headers.get('location');
    expect(location).toBeTruthy();
    const stateKey = new URL(location!).searchParams.get('state');
    expect(stateKey).toBeTruthy();

    for (let attempt = 1; attempt <= 10; attempt++) {
      const callbackRes = await fetch(`${LOCKOUT_BASE_URL}/oauth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': `198.51.100.${attempt}`,
          'x-real-ip': `203.0.113.${attempt}`,
        },
        body: new URLSearchParams({ state: stateKey!, pin: 'wrong-pin' }).toString(),
      });
      expect(callbackRes.status).toBe(403);
    }

    const lockedRes = await fetch(`${LOCKOUT_BASE_URL}/oauth/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': '198.51.100.250',
        'x-real-ip': '203.0.113.250',
      },
      body: new URLSearchParams({ state: stateKey!, pin: 'wrong-pin' }).toString(),
    });
    expect(lockedRes.status).toBe(429);

    serverProc.kill();
    spawnedProcesses.delete(serverProc);
  }, 30_000);
});
