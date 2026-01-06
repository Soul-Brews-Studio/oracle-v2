/**
 * ProcessManager - PID files, signal handlers, and child process lifecycle management
 *
 * Lightweight process manager for Bun applications.
 * Forked from claude-mem's infrastructure module.
 *
 * Handles:
 * - PID file management for daemon coordination
 * - Signal handler registration for graceful shutdown
 * - Child process enumeration and cleanup (especially for Windows zombie port fix)
 */

import path from 'path';
import { homedir } from 'os';
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { exec, execSync, spawn, type SpawnOptions } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';

const execAsync = promisify(exec);

// Configurable paths
let dataDir = path.join(homedir(), '.bun-process-manager');
let pidFileName = 'worker.pid';

/**
 * Configure the data directory and PID file name
 */
export function configure(options: { dataDir?: string; pidFileName?: string }): void {
  if (options.dataDir) dataDir = options.dataDir;
  if (options.pidFileName) pidFileName = options.pidFileName;
}

/**
 * Get the current data directory
 */
export function getDataDir(): string {
  return dataDir;
}

/**
 * Get the full path to the PID file
 */
export function getPidFilePath(): string {
  return path.join(dataDir, pidFileName);
}

export interface PidInfo {
  pid: number;
  port: number;
  startedAt: string;
  [key: string]: unknown; // Allow custom metadata
}

/**
 * Write PID info to the PID file location
 */
export function writePidFile(info: PidInfo): void {
  mkdirSync(dataDir, { recursive: true });
  const pidFile = getPidFilePath();
  writeFileSync(pidFile, JSON.stringify(info, null, 2));
}

/**
 * Read PID info from the PID file location
 * Returns null if file doesn't exist or is corrupted
 */
export function readPidFile(): PidInfo | null {
  const pidFile = getPidFilePath();
  if (!existsSync(pidFile)) return null;

  try {
    return JSON.parse(readFileSync(pidFile, 'utf-8'));
  } catch (error) {
    logger.warn('SYSTEM', 'Failed to parse PID file', { path: pidFile }, error as Error);
    return null;
  }
}

/**
 * Remove the PID file (called during shutdown)
 */
export function removePidFile(): void {
  const pidFile = getPidFilePath();
  if (!existsSync(pidFile)) return;

  try {
    unlinkSync(pidFile);
  } catch (error) {
    logger.warn('SYSTEM', 'Failed to remove PID file', { path: pidFile }, error as Error);
  }
}

/**
 * Get platform-adjusted timeout (Windows socket cleanup is slower)
 */
export function getPlatformTimeout(baseMs: number): number {
  const WINDOWS_MULTIPLIER = 2.0;
  return process.platform === 'win32' ? Math.round(baseMs * WINDOWS_MULTIPLIER) : baseMs;
}

/**
 * Check if a process is alive by sending signal 0
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all child process PIDs (Windows-specific)
 * Used for cleanup to prevent zombie ports when parent exits
 */
export async function getChildProcesses(parentPid: number): Promise<number[]> {
  if (process.platform !== 'win32') {
    return [];
  }

  // SECURITY: Validate PID is a positive integer to prevent command injection
  if (!Number.isInteger(parentPid) || parentPid <= 0) {
    logger.warn('SYSTEM', 'Invalid parent PID for child process enumeration', { parentPid });
    return [];
  }

  try {
    const cmd = `wmic process where "parentprocessid=${parentPid}" get processid /format:list`;
    const { stdout } = await execAsync(cmd, { timeout: 60000 });
    return stdout
      .trim()
      .split('\n')
      .map(line => {
        const match = line.match(/ProcessId=(\d+)/i);
        return match ? parseInt(match[1], 10) : NaN;
      })
      .filter(n => !isNaN(n) && Number.isInteger(n) && n > 0);
  } catch (error) {
    logger.warn('SYSTEM', 'Failed to enumerate child processes', { parentPid }, error as Error);
    return [];
  }
}

/**
 * Force kill a process by PID
 * Windows: uses taskkill /F /T to kill process tree
 * Unix: uses SIGKILL
 */
export async function forceKillProcess(pid: number): Promise<void> {
  // SECURITY: Validate PID is a positive integer to prevent command injection
  if (!Number.isInteger(pid) || pid <= 0) {
    logger.warn('SYSTEM', 'Invalid PID for force kill', { pid });
    return;
  }

  try {
    if (process.platform === 'win32') {
      // /T kills entire process tree, /F forces termination
      await execAsync(`taskkill /PID ${pid} /T /F`, { timeout: 60000 });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    logger.info('SYSTEM', 'Killed process', { pid });
  } catch (error) {
    logger.debug('SYSTEM', 'Process already exited during force kill', { pid }, error as Error);
  }
}

/**
 * Wait for processes to fully exit
 */
export async function waitForProcessesExit(pids: number[], timeoutMs: number): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const stillAlive = pids.filter(pid => isProcessAlive(pid));

    if (stillAlive.length === 0) {
      logger.info('SYSTEM', 'All processes exited');
      return true;
    }

    logger.debug('SYSTEM', 'Waiting for processes to exit', { stillAlive });
    await new Promise(r => setTimeout(r, 100));
  }

  logger.warn('SYSTEM', 'Timeout waiting for processes to exit');
  return false;
}

/**
 * Find processes matching a pattern (cross-platform)
 */
export async function findProcesses(pattern: string): Promise<number[]> {
  const isWindows = process.platform === 'win32';
  const pids: number[] = [];

  try {
    if (isWindows) {
      const cmd = `wmic process where "commandline like '%${pattern}%'" get processid /format:list`;
      const { stdout } = await execAsync(cmd, { timeout: 60000 });

      if (!stdout.trim()) return [];

      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const match = line.match(/ProcessId=(\d+)/i);
        if (match) {
          const pid = parseInt(match[1], 10);
          if (!isNaN(pid) && Number.isInteger(pid) && pid > 0) {
            pids.push(pid);
          }
        }
      }
    } else {
      const { stdout } = await execAsync(`ps aux | grep "${pattern}" | grep -v grep || true`);

      if (!stdout.trim()) return [];

      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 1) {
          const pid = parseInt(parts[1], 10);
          if (!isNaN(pid) && Number.isInteger(pid) && pid > 0) {
            pids.push(pid);
          }
        }
      }
    }
  } catch (error) {
    logger.warn('SYSTEM', 'Failed to find processes', { pattern }, error as Error);
  }

  return pids;
}

/**
 * Kill processes matching a pattern
 */
export async function killProcesses(pattern: string): Promise<number> {
  const pids = await findProcesses(pattern);

  if (pids.length === 0) {
    return 0;
  }

  logger.info('SYSTEM', 'Killing processes', { pattern, count: pids.length, pids });

  const isWindows = process.platform === 'win32';
  let killed = 0;

  for (const pid of pids) {
    try {
      if (isWindows) {
        execSync(`taskkill /PID ${pid} /T /F`, { timeout: 60000, stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGKILL');
      }
      killed++;
    } catch {
      logger.debug('SYSTEM', 'Process may have already exited', { pid });
    }
  }

  return killed;
}

export interface SpawnDaemonOptions {
  /** Script path to run */
  scriptPath: string;
  /** Port to pass via environment variable */
  port?: number;
  /** Environment variable name for port (default: WORKER_PORT) */
  portEnvVar?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Arguments to pass to script (default: ['--daemon']) */
  args?: string[];
  /** Spawn options override */
  spawnOptions?: Partial<SpawnOptions>;
}

/**
 * Spawn a detached daemon process
 * Returns the child PID or undefined if spawn failed
 */
export function spawnDaemon(options: SpawnDaemonOptions): number | undefined {
  const {
    scriptPath,
    port,
    portEnvVar = 'WORKER_PORT',
    env = {},
    args = ['--daemon'],
    spawnOptions = {}
  } = options;

  const envVars: Record<string, string | undefined> = { ...process.env, ...env };
  if (port !== undefined) {
    envVars[portEnvVar] = String(port);
  }

  const child = spawn(process.execPath, [scriptPath, ...args], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: envVars,
    ...spawnOptions
  });

  if (child.pid === undefined) {
    return undefined;
  }

  child.unref();
  return child.pid;
}

/**
 * Create signal handler factory for graceful shutdown
 * Returns a handler function that can be passed to process.on('SIGTERM') etc.
 */
export function createSignalHandler(
  shutdownFn: () => Promise<void>,
  isShuttingDownRef: { value: boolean }
): (signal: string) => Promise<void> {
  return async (signal: string) => {
    if (isShuttingDownRef.value) {
      logger.warn('SYSTEM', `Received ${signal} but shutdown already in progress`);
      return;
    }
    isShuttingDownRef.value = true;

    logger.info('SYSTEM', `Received ${signal}, shutting down...`);
    try {
      await shutdownFn();
      process.exit(0);
    } catch (error) {
      logger.error('SYSTEM', 'Error during shutdown', {}, error as Error);
      process.exit(1);
    }
  };
}

/**
 * Register common signal handlers
 */
export function registerSignalHandlers(
  shutdownFn: () => Promise<void>
): { isShuttingDown: { value: boolean } } {
  const isShuttingDown = { value: false };
  const handler = createSignalHandler(shutdownFn, isShuttingDown);

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));

  return { isShuttingDown };
}
