/**
 * Shared server fixture — spawn src/server.ts on demand, reuse if already up.
 * Mirrors the pattern in tests/http/core.test.ts.
 */
import type { Subprocess } from "bun";

export const BASE_URL = "http://localhost:47778";

let serverProcess: Subprocess | null = null;

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isServerRunning()) return true;
    await Bun.sleep(500);
  }
  return false;
}

const REPO_ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");

export async function ensureServer(): Promise<void> {
  if (await isServerRunning()) return;
  serverProcess = Bun.spawn(["bun", "run", "src/server.ts"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ORACLE_CHROMA_TIMEOUT: "3000" },
  });
  const ready = await waitForServer();
  if (!ready) throw new Error("Server failed to start for tests/cli/");
}

export function stopServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}
