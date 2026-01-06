/**
 * bun-process-manager - Lightweight process manager for Bun applications
 *
 * Forked from claude-mem's infrastructure module.
 * Provides PID file management, health checks, and graceful shutdown.
 */

// Logger (replaceable)
export { logger, setLogger, getLogger, type Logger, type LogLevel } from './logger.js';

// Process Management
export {
  configure,
  getDataDir,
  getPidFilePath,
  writePidFile,
  readPidFile,
  removePidFile,
  getPlatformTimeout,
  isProcessAlive,
  getChildProcesses,
  forceKillProcess,
  waitForProcessesExit,
  findProcesses,
  killProcesses,
  spawnDaemon,
  createSignalHandler,
  registerSignalHandlers,
  type PidInfo,
  type SpawnDaemonOptions
} from './ProcessManager.js';

// Health Monitoring
export {
  isPortInUse,
  waitForHealth,
  waitForPortFree,
  httpShutdown,
  getWorkerStatus,
  getWorkerVersion,
  type HealthCheckOptions
} from './HealthMonitor.js';

// Graceful Shutdown
export {
  performGracefulShutdown,
  createShutdownHandler,
  type GracefulShutdownConfig,
  type ShutdownableService,
  type CloseableResource
} from './GracefulShutdown.js';
