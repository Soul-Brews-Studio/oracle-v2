# NanoClaw Code Snippets & Patterns

**Date**: 2026-02-17 15:10
**Project**: NanoClaw - WhatsApp Agent System
**Source**: /Users/nat/Code/github.com/gavrielc/nanoclaw/

This document captures interesting code patterns, architectural decisions, and implementation details from the NanoClaw codebase. NanoClaw is a system that runs AI agents in containers and orchestrates them via WhatsApp group messaging.

---

## Table of Contents

1. [Application Entry Point](#application-entry-point)
2. [WhatsApp Channel Integration](#whatsapp-channel-integration)
3. [Container Management & IPC](#container-management--ipc)
4. [Task Scheduling](#task-scheduling)
5. [Group Queue & Concurrency](#group-queue--concurrency)
6. [Message Routing & Formatting](#message-routing--formatting)
7. [Configuration & Security](#configuration--security)
8. [TypeScript Patterns](#typescript-patterns)

---

## Application Entry Point

### Main Startup Flow (src/index.ts)

**What it does**: Orchestrates the entire NanoClaw system startup, including database initialization, WhatsApp connection, and subsystem startup.

**Key Pattern**: Guards against running when imported by tests

```typescript
// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start NanoClaw');
    process.exit(1);
  });
}
```

**Why it's interesting**: Common pattern for ESM modules that export utilities but shouldn't auto-run. Uses `import.meta.url` to compare paths rather than checking process.argv directly.

---

### Graceful Shutdown Pattern

**What it does**: Sets up signal handlers that properly shut down the system with a grace period

```typescript
async function main(): Promise<void> {
  ensureContainerSystemRunning();
  initDatabase();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await queue.shutdown(10000);  // 10s grace period
    await whatsapp.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ... initialize subsystems ...
}
```

**Why it's interesting**: Demonstrates proper async cleanup. The queue doesn't kill running containers during shutdown—it just detaches from them and lets them finish naturally via idle timeout. This prevents user-facing interruptions during WhatsApp reconnection restarts.

---

### State Management with Timestamps

**What it does**: Tracks message processing cursors per group to support crash recovery

```typescript
let lastTimestamp = '';  // Global cursor (all groups)
let lastAgentTimestamp: Record<string, string> = {};  // Per-group cursors

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}
```

**Why it's interesting**: Separates the "I saw this message" cursor from the "I processed this message" cursor. This allows:
- Non-trigger messages to accumulate as context
- Crash recovery: if a container crashes after advancing the "processed" cursor but before sending output, the cursor can be rolled back to retry

---

### Cursor Rollback on Error

**What it does**: Intelligently decides whether to rollback the message processing cursor on error

```typescript
const output = await runAgent(group, prompt, chatJid, async (result) => {
  if (result.result) {
    const raw = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
    const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
    if (text) {
      await whatsapp.sendMessage(chatJid, text);
      outputSentToUser = true;
    }
  }
  if (result.status === 'error') {
    hadError = true;
  }
});

// If we already sent output to the user, don't roll back the cursor —
// the user got their response and re-processing would send duplicates.
if (output === 'error' || hadError) {
  if (outputSentToUser) {
    logger.warn({ group: group.name },
      'Agent error after output was sent, skipping cursor rollback to prevent duplicates');
    return true;  // Success (don't retry)
  }
  // Roll back cursor so retries can re-process these messages
  lastAgentTimestamp[chatJid] = previousCursor;
  saveState();
  return false;  // Failure (do retry)
}
```

**Why it's interesting**: Once the user has seen output, re-processing and re-sending would be worse than an incomplete response. This is a key insight for distributed systems: user visibility changes failure recovery strategy.

---

## WhatsApp Channel Integration

### Channel Abstraction (src/types.ts)

**What it does**: Defines the pluggable interface for communication channels

```typescript
export interface Channel {
  name: string;
  connect(): Promise<void>;
  sendMessage(jid: string, text: string): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean;
  disconnect(): Promise<void>;
  // Optional: typing indicator. Channels that support it implement it.
  setTyping?(jid: string, isTyping: boolean): Promise<void>;
}

// Callback type that channels use to deliver inbound messages
export type OnInboundMessage = (chatJid: string, message: NewMessage) => void;
```

**Why it's interesting**: The system is designed to support multiple channels (WhatsApp, Telegram, etc.) with a common interface. The optional `setTyping` method shows how to handle capability differences.

---

### WhatsApp Connection & Authentication (src/channels/whatsapp.ts)

**What it does**: Manages the WhatsApp connection lifecycle using Baileys library

```typescript
async connectInternal(onFirstOpen?: () => void): Promise<void> {
  const authDir = path.join(STORE_DIR, 'auth');
  fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  this.sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: Browsers.macOS('Chrome'),
  });

  this.sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const msg = 'WhatsApp authentication required. Run /setup in Claude Code.';
      logger.error(msg);
      exec(
        `osascript -e 'display notification "${msg}" with title "NanoClaw" sound name "Basso"'`,
      );
      setTimeout(() => process.exit(1), 1000);
    }

    if (connection === 'close') {
      // ... handle reconnection ...
    } else if (connection === 'open') {
      this.connected = true;
      // Announce availability (enables typing indicators)
      this.sock.sendPresenceUpdate('available').catch(() => {});
    }
  });

  this.sock.ev.on('creds.update', saveCreds);
  this.sock.ev.on('messages.upsert', async ({ messages }) => {
    // ... handle inbound messages ...
  });
}
```

**Why it's interesting**:
- Uses event-driven architecture for connection management
- Graceful degradation: only exits on QR code (auth required), not on disconnection
- Announces availability for presence updates (typing indicators)
- Credentials are persisted to disk automatically via the `saveCreds` callback

---

### LID-to-Phone JID Translation

**What it does**: Handles WhatsApp's LID (Linked ID) system for multi-device accounts

```typescript
private lidToPhoneMap: Record<string, string> = {};

this.sock.ev.on('connection.update', (update) => {
  if (connection === 'open') {
    // Build LID to phone mapping from auth state for self-chat translation
    if (this.sock.user) {
      const phoneUser = this.sock.user.id.split(':')[0];
      const lidUser = this.sock.user.lid?.split(':')[0];
      if (lidUser && phoneUser) {
        this.lidToPhoneMap[lidUser] = `${phoneUser}@s.whatsapp.net`;
      }
    }
  }
});

private async translateJid(jid: string): Promise<string> {
  if (!jid.endsWith('@lid')) return jid;
  const lidUser = jid.split('@')[0].split(':')[0];

  // Check local cache first
  const cached = this.lidToPhoneMap[lidUser];
  if (cached) return cached;

  // Query Baileys' signal repository for the mapping
  try {
    const pn = await this.sock.signalRepository?.lidMapping?.getPNForLID(jid);
    if (pn) {
      const phoneJid = `${pn.split('@')[0].split(':')[0]}@s.whatsapp.net`;
      this.lidToPhoneMap[lidUser] = phoneJid;
      return phoneJid;
    }
  } catch (err) {
    logger.debug({ err, jid }, 'Failed to resolve LID via signalRepository');
  }

  return jid;
}
```

**Why it's interesting**: WhatsApp's multi-device protocol uses LID for the device account, but conversations are indexed by phone number. This two-level translation ensures consistent handling.

---

### Message Deduplication Logic

**What it does**: Distinguishes bot messages from user messages across different deployment scenarios

```typescript
const fromMe = msg.key.fromMe || false;
// Detect bot messages: with own number, fromMe is reliable
// since only the bot sends from that number.
// With shared number, bot messages carry the assistant name prefix
// (even in DMs/self-chat) so we check for that.
const isBotMessage = ASSISTANT_HAS_OWN_NUMBER
  ? fromMe
  : content.startsWith(`${ASSISTANT_NAME}:`);
```

**Why it's interesting**: Handles two deployment models:
1. **Dedicated bot number**: `fromMe` is reliable
2. **Shared number** (e.g., personal + bot): Bot prefixes its messages, even in self-chat

This affects how the system processes its own output during testing/development.

---

### Outgoing Queue with Reconnection Recovery

**What it does**: Buffers messages during disconnection and flushes them on reconnect

```typescript
private outgoingQueue: Array<{ jid: string; text: string }> = [];
private flushing = false;

async sendMessage(jid: string, text: string): Promise<void> {
  const prefixed = ASSISTANT_HAS_OWN_NUMBER
    ? text
    : `${ASSISTANT_NAME}: ${text}`;

  if (!this.connected) {
    this.outgoingQueue.push({ jid, text: prefixed });
    logger.info({ jid, length: prefixed.length, queueSize: this.outgoingQueue.length },
      'WA disconnected, message queued');
    return;
  }
  try {
    await this.sock.sendMessage(jid, { text: prefixed });
  } catch (err) {
    // If send fails, queue it for retry on reconnect
    this.outgoingQueue.push({ jid, text: prefixed });
    logger.warn({ jid, err, queueSize: this.outgoingQueue.length },
      'Failed to send, message queued');
  }
}

private async flushOutgoingQueue(): Promise<void> {
  if (this.flushing || this.outgoingQueue.length === 0) return;
  this.flushing = true;
  try {
    logger.info({ count: this.outgoingQueue.length }, 'Flushing outgoing message queue');
    while (this.outgoingQueue.length > 0) {
      const item = this.outgoingQueue.shift()!;
      await this.sock.sendMessage(item.jid, { text: item.text });
    }
  } finally {
    this.flushing = false;
  }
}
```

**Why it's interesting**: Provides reliability for message delivery without additional infrastructure. The dual queueing (disconnect and send failure) ensures messages survive both connection and transient errors.

---

## Container Management & IPC

### Volume Mount Builder Pattern

**What it does**: Constructs secure container mounts with fine-grained access control

```typescript
function buildVolumeMounts(group: RegisteredGroup, isMain: boolean): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const homeDir = getHomeDir();
  const projectRoot = process.cwd();

  if (isMain) {
    // Main gets the entire project root mounted
    mounts.push({
      hostPath: projectRoot,
      containerPath: '/workspace/project',
      readonly: false,
    });
    // Main also gets its group folder as the working directory
    mounts.push({
      hostPath: path.join(GROUPS_DIR, group.folder),
      containerPath: '/workspace/group',
      readonly: false,
    });
  } else {
    // Other groups only get their own folder
    mounts.push({
      hostPath: path.join(GROUPS_DIR, group.folder),
      containerPath: '/workspace/group',
      readonly: false,
    });
    // Global memory directory (read-only for non-main)
    const globalDir = path.join(GROUPS_DIR, 'global');
    if (fs.existsSync(globalDir)) {
      mounts.push({
        hostPath: globalDir,
        containerPath: '/workspace/global',
        readonly: true,
      });
    }
  }

  // Per-group Claude sessions directory (isolated from other groups)
  const groupSessionsDir = path.join(DATA_DIR, 'sessions', group.folder, '.claude');
  fs.mkdirSync(groupSessionsDir, { recursive: true });

  // Sync skills into group's Claude sessions
  const skillsSrc = path.join(process.cwd(), 'container', 'skills');
  const skillsDst = path.join(groupSessionsDir, 'skills');
  if (fs.existsSync(skillsSrc)) {
    for (const skillDir of fs.readdirSync(skillsSrc)) {
      const srcDir = path.join(skillsSrc, skillDir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const dstDir = path.join(skillsDst, skillDir);
      fs.mkdirSync(dstDir, { recursive: true });
      for (const file of fs.readdirSync(srcDir)) {
        fs.copyFileSync(path.join(srcDir, file), path.join(dstDir, file));
      }
    }
  }

  mounts.push({
    hostPath: groupSessionsDir,
    containerPath: '/home/node/.claude',
    readonly: false,
  });

  // Per-group IPC namespace: each group gets its own IPC directory
  // This prevents cross-group privilege escalation via IPC
  const groupIpcDir = path.join(DATA_DIR, 'ipc', group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'input'), { recursive: true });
  mounts.push({
    hostPath: groupIpcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // Additional mounts validated against external allowlist
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(...);
    mounts.push(...validatedMounts);
  }

  return mounts;
}
```

**Why it's interesting**:
- **Isolation**: Each group has separate session, skills, and IPC directories
- **Security**: Non-main groups are read-only for global resources
- **Privilege scaling**: Main group can see all groups; others only see themselves
- **Dynamic skills sync**: Custom skills are distributed to each group's Claude environment
- **Mount allowlist**: Additional mounts are validated against a tamper-proof external file

---

### Streaming Output Parsing

**What it does**: Parses container output in real-time using sentinel markers

```typescript
// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

container.stdout.on('data', (data) => {
  const chunk = data.toString();

  // Always accumulate for logging
  if (!stdoutTruncated) {
    const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
    if (chunk.length > remaining) {
      stdout += chunk.slice(0, remaining);
      stdoutTruncated = true;
      logger.warn(
        { group: group.name, size: stdout.length },
        'Container stdout truncated due to size limit',
      );
    } else {
      stdout += chunk;
    }
  }

  // Stream-parse for output markers
  if (onOutput) {
    parseBuffer += chunk;
    let startIdx: number;
    while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
      const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
      if (endIdx === -1) break; // Incomplete pair, wait for more data

      const jsonStr = parseBuffer
        .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
        .trim();
      parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

      try {
        const parsed: ContainerOutput = JSON.parse(jsonStr);
        if (parsed.newSessionId) {
          newSessionId = parsed.newSessionId;
        }
        hadStreamingOutput = true;
        // Activity detected — reset the hard timeout
        resetTimeout();
        // Call onOutput for all markers (including null results)
        outputChain = outputChain.then(() => onOutput(parsed));
      } catch (err) {
        logger.warn(
          { group: group.name, error: err },
          'Failed to parse streamed output chunk',
        );
      }
    }
  }
});
```

**Why it's interesting**:
- **Streaming**: Parses JSON objects as they arrive, without waiting for container to finish
- **Robustness**: Sentinel markers survive console output noise
- **Buffering**: Handles incomplete JSON pairs gracefully
- **Async chaining**: Uses Promise chain to maintain order of streamed results
- **Timeout reset**: Activity detection resets idle timeout, preventing premature container kill

---

### Smart Timeout Management

**What it does**: Distinguishes between activity timeout and idle timeout

```typescript
let timedOut = false;
let hadStreamingOutput = false;
const configTimeout = group.containerConfig?.timeout || CONTAINER_TIMEOUT;
// Grace period: hard timeout must be at least IDLE_TIMEOUT + 30s so the
// graceful _close sentinel has time to trigger before the hard kill fires.
const timeoutMs = Math.max(configTimeout, IDLE_TIMEOUT + 30_000);

const killOnTimeout = () => {
  timedOut = true;
  logger.error({ group: group.name, containerName }, 'Container timeout, stopping gracefully');
  exec(`container stop ${containerName}`, { timeout: 15000 }, (err) => {
    if (err) {
      logger.warn({ group: group.name, containerName, err }, 'Graceful stop failed, force killing');
      container.kill('SIGKILL');
    }
  });
};

let timeout = setTimeout(killOnTimeout, timeoutMs);

// Reset the timeout whenever there's activity (streaming output)
const resetTimeout = () => {
  clearTimeout(timeout);
  timeout = setTimeout(killOnTimeout, timeoutMs);
};

container.stdout.on('data', (data) => {
  // ... parse output ...
  if (onOutput) {
    // Activity detected — reset the hard timeout
    resetTimeout();
  }
});

container.on('close', (code) => {
  clearTimeout(timeout);

  if (timedOut) {
    // Timeout after output = idle cleanup, not failure.
    if (hadStreamingOutput) {
      logger.info(
        { group: group.name, containerName, duration, code },
        'Container timed out after output (idle cleanup)',
      );
      outputChain.then(() => {
        resolve({
          status: 'success',
          result: null,
          newSessionId,
        });
      });
      return;
    }
    // ... error case ...
  }
});
```

**Why it's interesting**:
- **Two-level timeout**: Global timeout prevents runaway, but activity detection resets it
- **Idle cleanup**: Timeout after output is treated as success (container cleanup), not error
- **Graceful degradation**: Tries graceful stop, falls back to SIGKILL
- **Grace period math**: Hard timeout accounts for idle timeout + 30s to allow graceful cleanup signal to propagate

---

### Secrets Handling via stdin

**What it does**: Passes secrets to containers without persisting to disk

```typescript
/**
 * Read allowed secrets from .env for passing to the container via stdin.
 * Secrets are never written to disk or mounted as files.
 */
function readSecrets(): Record<string, string> {
  return readEnvFile(['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']);
}

// In runContainerAgent:
const container = spawn('container', containerArgs, {
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Pass secrets via stdin (never written to disk or mounted as files)
input.secrets = readSecrets();
container.stdin.write(JSON.stringify(input));
container.stdin.end();
// Remove secrets from input so they don't appear in logs
delete input.secrets;
```

**Why it's interesting**:
- **No persistence**: Secrets only exist in memory
- **No volume mounts**: Secrets aren't written to disk or mounted as files
- **Clean input**: Secrets removed before logging
- **stdin delivery**: Trusted for local container communication

---

## Task Scheduling

### Cron-Based Task Scheduling

**What it does**: Schedules tasks based on cron expressions, intervals, or one-off times

```typescript
export async function runTask(task: ScheduledTask, deps: SchedulerDependencies): Promise<void> {
  const startTime = Date.now();

  // ... find group, setup ...

  let result: string | null = null;
  let error: string | null = null;

  // For group context mode, use the group's current session
  const sessions = deps.getSessions();
  const sessionId =
    task.context_mode === 'group' ? sessions[task.group_folder] : undefined;

  // Idle timer: writes _close sentinel after IDLE_TIMEOUT of no output,
  // so the container exits instead of hanging at waitForIpcMessage forever.
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug({ taskId: task.id }, 'Scheduled task idle timeout, closing container stdin');
      deps.queue.closeStdin(task.chat_jid);
    }, IDLE_TIMEOUT);
  };

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt: task.prompt,
        sessionId,
        groupFolder: task.group_folder,
        chatJid: task.chat_jid,
        isMain,
        isScheduledTask: true,
      },
      (proc, containerName) => deps.onProcess(task.chat_jid, proc, containerName, task.group_folder),
      async (streamedOutput: ContainerOutput) => {
        if (streamedOutput.result) {
          result = streamedOutput.result;
          // Forward result to user
          await deps.sendMessage(task.chat_jid, streamedOutput.result);
          resetIdleTimer();
        }
        if (streamedOutput.status === 'error') {
          error = streamedOutput.error || 'Unknown error';
        }
      },
    );
  } catch (err) {
    // ...
  }

  const durationMs = Date.now() - startTime;

  logTaskRun({
    task_id: task.id,
    run_at: new Date().toISOString(),
    duration_ms: durationMs,
    status: error ? 'error' : 'success',
    result,
    error,
  });

  // Calculate next run time
  let nextRun: string | null = null;
  if (task.schedule_type === 'cron') {
    const interval = CronExpressionParser.parse(task.schedule_value, {
      tz: TIMEZONE,
    });
    nextRun = interval.next().toISOString();
  } else if (task.schedule_type === 'interval') {
    const ms = parseInt(task.schedule_value, 10);
    nextRun = new Date(Date.now() + ms).toISOString();
  }
  // 'once' tasks have no next run

  const resultSummary = error
    ? `Error: ${error}`
    : result
      ? result.slice(0, 200)
      : 'Completed';
  updateTaskAfterRun(task.id, nextRun, resultSummary);
}
```

**Why it's interesting**:
- **Flexible scheduling**: Cron (recurring), intervals, or one-off
- **Context modes**: Tasks can use group session (stateful) or isolated session
- **Idle timeout**: Sends close sentinel instead of letting container hang
- **Run logging**: Captures duration, status, result for audit trail
- **Next run calculation**: Automatically computes next execution time

---

### Scheduler Loop Pattern

**What it does**: Polls database for due tasks and enqueues them

```typescript
export function startSchedulerLoop(deps: SchedulerDependencies): void {
  if (schedulerRunning) {
    logger.debug('Scheduler loop already running, skipping duplicate start');
    return;
  }
  schedulerRunning = true;
  logger.info('Scheduler loop started');

  const loop = async () => {
    try {
      const dueTasks = getDueTasks();
      if (dueTasks.length > 0) {
        logger.info({ count: dueTasks.length }, 'Found due tasks');
      }

      for (const task of dueTasks) {
        // Re-check task status in case it was paused/cancelled
        const currentTask = getTaskById(task.id);
        if (!currentTask || currentTask.status !== 'active') {
          continue;
        }

        deps.queue.enqueueTask(
          currentTask.chat_jid,
          currentTask.id,
          () => runTask(currentTask, deps),
        );
      }
    } catch (err) {
      logger.error({ err }, 'Error in scheduler loop');
    }

    setTimeout(loop, SCHEDULER_POLL_INTERVAL);
  };

  loop();
}
```

**Why it's interesting**:
- **Duplicate start guard**: Prevents multiple scheduler instances
- **Re-check before run**: Verifies task wasn't paused/cancelled between poll and execution
- **Lazy polling**: Simplicity over event-driven (no database triggers)
- **Queue integration**: Uses the same queue mechanism as message processing

---

## Group Queue & Concurrency

### Fair Concurrency Management

**What it does**: Manages container concurrency across multiple groups with fair scheduling

```typescript
export class GroupQueue {
  private groups = new Map<string, GroupState>();
  private activeCount = 0;
  private waitingGroups: string[] = [];
  private processMessagesFn: ((groupJid: string) => Promise<boolean>) | null = null;
  private shuttingDown = false;

  enqueueMessageCheck(groupJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    if (state.active) {
      state.pendingMessages = true;
      logger.debug({ groupJid }, 'Container active, message queued');
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingMessages = true;
      if (!this.waitingGroups.includes(groupJid)) {
        this.waitingGroups.push(groupJid);
      }
      logger.debug(
        { groupJid, activeCount: this.activeCount },
        'At concurrency limit, message queued',
      );
      return;
    }

    this.runForGroup(groupJid, 'messages');
  }

  enqueueTask(groupJid: string, taskId: string, fn: () => Promise<void>): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    // Prevent double-queuing of the same task
    if (state.pendingTasks.some((t) => t.id === taskId)) {
      logger.debug({ groupJid, taskId }, 'Task already queued, skipping');
      return;
    }

    if (state.active) {
      state.pendingTasks.push({ id: taskId, groupJid, fn });
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingTasks.push({ id: taskId, groupJid, fn });
      if (!this.waitingGroups.includes(groupJid)) {
        this.waitingGroups.push(groupJid);
      }
      return;
    }

    // Run immediately
    this.runTask(groupJid, { id: taskId, groupJid, fn });
  }

  private drainGroup(groupJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    // Tasks first (they won't be re-discovered from SQLite like messages)
    if (state.pendingTasks.length > 0) {
      const task = state.pendingTasks.shift()!;
      this.runTask(groupJid, task);
      return;
    }

    // Then pending messages
    if (state.pendingMessages) {
      this.runForGroup(groupJid, 'drain');
      return;
    }

    // Nothing pending for this group; check if other groups are waiting for a slot
    this.drainWaiting();
  }

  private drainWaiting(): void {
    while (
      this.waitingGroups.length > 0 &&
      this.activeCount < MAX_CONCURRENT_CONTAINERS
    ) {
      const nextJid = this.waitingGroups.shift()!;
      const state = this.getGroup(nextJid);

      // Prioritize tasks over messages
      if (state.pendingTasks.length > 0) {
        const task = state.pendingTasks.shift()!;
        this.runTask(nextJid, task);
      } else if (state.pendingMessages) {
        this.runForGroup(nextJid, 'drain');
      }
    }
  }
}
```

**Why it's interesting**:
- **Fair scheduling**: FIFO queue for waiting groups
- **Task priority**: Scheduled tasks run before messages (less discoverable)
- **Per-group batching**: All pending messages for a group run in one container (context)
- **Drain logic**: Tasks → messages → waiting queue
- **Duplicate prevention**: Tasks checked before queueing to avoid re-queuing
- **Graceful shutdown**: Detaches containers instead of killing them

---

### IPC-Based Stdin Communication

**What it does**: Sends follow-up messages to running containers via IPC files

```typescript
/**
 * Send a follow-up message to the active container via IPC file.
 * Returns true if the message was written, false if no active container.
 */
sendMessage(groupJid: string, text: string): boolean {
  const state = this.getGroup(groupJid);
  if (!state.active || !state.groupFolder) return false;

  const inputDir = path.join(DATA_DIR, 'ipc', state.groupFolder, 'input');
  try {
    fs.mkdirSync(inputDir, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
    const filepath = path.join(inputDir, filename);
    const tempPath = `${filepath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({ type: 'message', text }));
    fs.renameSync(tempPath, filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Signal the active container to wind down by writing a close sentinel.
 */
closeStdin(groupJid: string): void {
  const state = this.getGroup(groupJid);
  if (!state.active || !state.groupFolder) return;

  const inputDir = path.join(DATA_DIR, 'ipc', state.groupFolder, 'input');
  try {
    fs.mkdirSync(inputDir, { recursive: true });
    fs.writeFileSync(path.join(inputDir, '_close'), '');
  } catch {
    // ignore
  }
}
```

**Why it's interesting**:
- **Atomic file operations**: Uses `.tmp` → rename pattern to avoid partial writes
- **Unique filenames**: Timestamp + random suffix prevents collisions
- **No process handles**: Pure filesystem-based IPC (works across host/container)
- **Close sentinel**: Special `_close` file signals graceful shutdown
- **Best-effort**: Catch-all for error handling (IPC is optional)

---

## Message Routing & Formatting

### XML-Based Message Formatting

**What it does**: Formats messages with XML structure for agent processing

```typescript
export function escapeXml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMessages(messages: NewMessage[]): string {
  const lines = messages.map((m) =>
    `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`,
  );
  return `<messages>\n${lines.join('\n')}\n</messages>`;
}
```

**Why it's interesting**:
- **Structured format**: XML provides clear boundaries and nesting
- **Escaping**: Prevents injection attacks via message content
- **Metadata**: Sender and timestamp included for context
- **Simple parsing**: Agents can easily extract and understand structure

---

### Internal Reasoning Suppression

**What it does**: Strips `<internal>` tags from agent output before sending to users

```typescript
export function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}

export function formatOutbound(rawText: string): string {
  const text = stripInternalTags(rawText);
  if (!text) return '';
  return text;
}

// In message processing:
const raw = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
// Strip <internal>...</internal> blocks — agent uses these for internal reasoning
const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
logger.info({ group: group.name }, `Agent output: ${raw.slice(0, 200)}`);
if (text) {
  await whatsapp.sendMessage(chatJid, text);
}
```

**Why it's interesting**:
- **Dual logging**: Full output (with internal) logged for debugging, user sees filtered version
- **Agent freedom**: Agents can reason internally without user seeing it
- **Regex pattern**: `[\s\S]*?` matches newlines (careful with regex modes)

---

## Configuration & Security

### Mount Allowlist for Security

**What it does**: Defines a tamper-proof allowlist for container mount permissions

```typescript
// src/types.ts
export interface MountAllowlist {
  // Directories that can be mounted into containers
  allowedRoots: AllowedRoot[];
  // Glob patterns for paths that should never be mounted (e.g., ".ssh", ".gnupg")
  blockedPatterns: string[];
  // If true, non-main groups can only mount read-only regardless of config
  nonMainReadOnly: boolean;
}

export interface AllowedRoot {
  // Absolute path or ~ for home (e.g., "~/projects", "/var/repos")
  path: string;
  // Whether read-write mounts are allowed under this root
  allowReadWrite: boolean;
  // Optional description for documentation
  description?: string;
}

// src/config.ts
// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
```

**Why it's interesting**:
- **External storage**: Allowlist is outside the project (can't be tampered by containers)
- **Never mounted**: Allowlist never appears in any container
- **Glob patterns**: Can block sensitive directories like `.ssh`, `.gnupg`
- **Per-group restrictions**: Non-main groups can be restricted to read-only
- **Fine-grained control**: Per-root read-write toggle

---

### IPC Authorization Pattern

**What it does**: Verifies that groups can only operate on their own resources via IPC

```typescript
export async function processTaskIpc(
  data: { /* ... */ },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean,     // Verified from directory path
  deps: IpcDeps,
): Promise<void> {
  const registeredGroups = deps.registeredGroups();

  switch (data.type) {
    case 'schedule_task':
      if (data.prompt && data.schedule_type && data.schedule_value && data.targetJid) {
        const targetJid = data.targetJid as string;
        const targetGroupEntry = registeredGroups[targetJid];

        if (!targetGroupEntry) {
          logger.warn({ targetJid }, 'Cannot schedule task: target group not registered');
          break;
        }

        const targetFolder = targetGroupEntry.folder;

        // Authorization: non-main groups can only schedule for themselves
        if (!isMain && targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }
        // ... proceed ...
      }
      break;

    case 'register_group':
      // Only main group can register new groups
      if (!isMain) {
        logger.warn({ sourceGroup }, 'Unauthorized register_group attempt blocked');
        break;
      }
      // ... proceed ...
      break;
  }
}
```

**Why it's interesting**:
- **Identity from location**: `sourceGroup` verified by IPC directory path
- **Privilege levels**: Main group can see all, non-main groups isolated
- **Explicit checks**: Every operation has an authorization check
- **Audit logging**: Unauthorized attempts are logged with context

---

## TypeScript Patterns

### Dependency Injection via Interfaces

**What it does**: Passes dependencies as interfaces for testability

```typescript
export interface SchedulerDependencies {
  registeredGroups: () => Record<string, RegisteredGroup>;
  getSessions: () => Record<string, string>;
  queue: GroupQueue;
  onProcess: (groupJid: string, proc: ChildProcess, containerName: string, groupFolder: string) => void;
  sendMessage: (jid: string, text: string) => Promise<void>;
}

export interface IpcDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  syncGroupMetadata: (force: boolean) => Promise<void>;
  getAvailableGroups: () => AvailableGroup[];
  writeGroupsSnapshot: (
    groupFolder: string,
    isMain: boolean,
    availableGroups: AvailableGroup[],
    registeredJids: Set<string>,
  ) => void;
}

// Usage:
export function startSchedulerLoop(deps: SchedulerDependencies): void {
  const loop = async () => {
    const dueTasks = getDueTasks();
    for (const task of dueTasks) {
      deps.queue.enqueueTask(
        currentTask.chat_jid,
        currentTask.id,
        () => runTask(currentTask, deps),
      );
    }
  };
}
```

**Why it's interesting**:
- **Interface-based**: Consumers depend on contracts, not implementations
- **Callable properties**: `registeredGroups: () => Record<string, RegisteredGroup>` provides lazy access
- **Testability**: Easy to mock for unit tests
- **Modular subsystems**: Scheduler and IPC are independent modules

---

### Callback Chains for Streaming

**What it does**: Uses callback and Promise chaining for streaming output

```typescript
let outputChain = Promise.resolve();

container.stdout.on('data', (data) => {
  // ... parse markers ...
  if (onOutput) {
    // Activity detected — reset the hard timeout
    resetTimeout();
    // Call onOutput for all markers (including null results)
    outputChain = outputChain.then(() => onOutput(parsed));
  }
});

container.on('close', (code) => {
  if (onOutput) {
    outputChain.then(() => {
      logger.info({ group: group.name, duration, newSessionId }, 'Container completed (streaming mode)');
      resolve({
        status: 'success',
        result: null,
        newSessionId,
      });
    });
    return;
  }
  // ... non-streaming mode ...
});
```

**Why it's interesting**:
- **Order preservation**: Promise chain ensures results are processed in order
- **Non-blocking**: Each output callback can be async without blocking the stream
- **Completion wait**: Final resolution waits for all callbacks to complete

---

### Environment Variable Patterns

**What it does**: Loads configuration with fallbacks and type safety

```typescript
// src/config.ts
const envConfig = readEnvFile(['ASSISTANT_NAME', 'ASSISTANT_HAS_OWN_NUMBER']);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER || envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
```

**Why it's interesting**:
- **Layered fallbacks**: process.env → .env file → hardcoded defaults
- **Type conversion**: parseInt for numeric config
- **Dynamic regex**: Trigger pattern built from assistant name
- **System timezone**: Uses system timezone unless overridden
- **Secrets separation**: Secrets are read at container spawn time, not at startup

---

## Summary & Key Insights

### Architectural Patterns

1. **Multi-level concurrency control**: Fair scheduling across groups + per-group task queueing
2. **Filesystem-based IPC**: Stateless, container-safe, no network dependencies
3. **Cursor-based recovery**: Separate "seen" and "processed" cursors for crash recovery
4. **Streaming with markers**: Real-time output parsing without waiting for container exit
5. **Mount isolation**: Each group has separate sessions/IPC/skills/global directories

### Error Handling Philosophies

1. **Smart cursor rollback**: Only rollback if user hasn't seen output
2. **Graceful container shutdown**: Detach containers on shutdown; they finish naturally
3. **Idle timeout + activity reset**: Prevents timeouts during processing
4. **Grace period for cleanup**: Hard timeout accounts for graceful shutdown time
5. **Best-effort IPC**: Non-critical path catches and logs errors

### Security Practices

1. **Secrets via stdin**: Never persisted to disk
2. **IPC authorization**: Verify group identity from directory path
3. **Mount allowlist**: External, tamper-proof configuration
4. **Per-group isolation**: Separate sessions, skills, IPC directories
5. **Read-only defaults**: Non-main groups restricted to read-only for global resources

---

## File Reference

- **Entry point**: `/Users/nat/Code/github.com/gavrielc/nanoclaw/src/index.ts`
- **WhatsApp channel**: `/Users/nat/Code/github.com/gavrielc/nanoclaw/src/channels/whatsapp.ts`
- **Container management**: `/Users/nat/Code/github.com/gavrielc/nanoclaw/src/container-runner.ts`
- **Task scheduling**: `/Users/nat/Code/github.com/gavrielc/nanoclaw/src/task-scheduler.ts`
- **Group queue**: `/Users/nat/Code/github.com/gavrielc/nanoclaw/src/group-queue.ts`
- **IPC handler**: `/Users/nat/Code/github.com/gavrielc/nanoclaw/src/ipc.ts`
- **Message routing**: `/Users/nat/Code/github.com/gavrielc/nanoclaw/src/router.ts`
- **Type definitions**: `/Users/nat/Code/github.com/gavrielc/nanoclaw/src/types.ts`
- **Configuration**: `/Users/nat/Code/github.com/gavrielc/nanoclaw/src/config.ts`
