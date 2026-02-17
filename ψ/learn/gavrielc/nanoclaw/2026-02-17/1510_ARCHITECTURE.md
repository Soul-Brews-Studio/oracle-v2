# NanoClaw Architecture: Complete Design Document

**Date**: February 17, 2026
**Version**: 1.0.0
**Project**: nanoclaw - Personal Claude Assistant
**Repo**: https://github.com/gavrielc/nanoclaw

---

## Executive Summary

NanoClaw is a lightweight, self-hosted Claude assistant that runs on macOS and bridges WhatsApp messaging with Claude's Agent SDK running in isolated containers. The system uses Apple Container (Linux VMs) for agent execution, SQLite for state management, and a sophisticated multi-group queuing system to handle parallel agent execution while maintaining group-level isolation.

**Key Architectural Principles:**
- Single Node.js orchestrator process coordinates all subsystems
- Each group (WhatsApp chat) has isolated container execution, filesystem, and session context
- Agent swarms (multi-agent teams) are supported via Claude Agent SDK
- Scheduled tasks with cron/interval/once scheduling
- IPC (Inter-Process Communication) via JSON files for agent-to-host communication
- Mount security via external allowlist (tamper-proof from containers)

---

## Directory Structure & Organization

```
nanoclaw/
├── src/                          # Main Node.js orchestrator (TypeScript)
│   ├── index.ts                  # Core state machine & message loop
│   ├── config.ts                 # Config & environment variables
│   ├── types.ts                  # Type definitions (Message, Group, Task, Channel)
│   ├── db.ts                     # SQLite operations
│   ├── channels/
│   │   └── whatsapp.ts           # WhatsApp channel (Baileys library)
│   ├── container-runner.ts       # Spawns agent containers with mounts
│   ├── group-queue.ts            # Multi-group concurrent execution queue
│   ├── ipc.ts                    # IPC watcher (messages, tasks, group registration)
│   ├── task-scheduler.ts         # Scheduled task runner (cron/interval/once)
│   ├── router.ts                 # Message formatting (XML for agent input)
│   ├── mount-security.ts         # Additional mount validation
│   ├── logger.ts                 # Pino logging
│   └── *.test.ts                 # Vitest unit tests
│
├── container/                    # Agent runtime environment
│   ├── Dockerfile                # Linux container image (node:22-slim + Chromium)
│   ├── build.sh                  # Build script for container image
│   ├── agent-runner/
│   │   ├── package.json          # Agent runtime dependencies
│   │   ├── src/
│   │   │   ├── index.ts          # Main agent executor (Claude SDK query loop)
│   │   │   └── ipc-mcp-stdio.ts  # MCP server for IPC communication
│   │   └── dist/                 # Compiled agent code (TypeScript)
│   └── skills/                   # MCP-compatible skills directory
│       └── <skill-name>/         # Custom skills available to agents
│
├── groups/                       # Per-group data (user-managed)
│   ├── main/                     # Main group (special: has full project access)
│   │   ├── CLAUDE.md             # Group memory (isolated per group)
│   │   ├── logs/                 # Container logs
│   │   └── conversations/        # Archived transcript archives
│   ├── global/                   # Shared read-only context (for non-main groups)
│   │   └── CLAUDE.md             # Global system context
│   └── <group-folder>/           # One folder per registered group
│       └── ... (same structure)
│
├── data/                         # Runtime state (generated)
│   ├── auth/                     # WhatsApp Baileys auth state
│   ├── nanoclaw.db               # SQLite database
│   ├── ipc/                      # Inter-process communication
│   │   ├── <group>/
│   │   │   ├── input/            # Follow-up messages (JSON files)
│   │   │   ├── messages/         # Outbound IPC messages from agents
│   │   │   ├── tasks/            # Task creation/control from agents
│   │   │   └── current_tasks.json # Snapshot of tasks visible to group
│   ├── sessions/                 # Per-group Claude Code sessions
│   │   ├── <group>/.claude/      # Settings & skills for each group's session
│   │   └── ...
│   └── errors/                   # IPC processing errors
│
├── config-examples/              # Configuration templates
│   └── mount-allowlist.json      # Example mount security config
│
├── launchd/                      # macOS service configuration
│   └── com.nanoclaw.plist        # LaunchAgent for autostart
│
├── package.json                  # Main project dependencies
├── tsconfig.json                 # TypeScript configuration
├── CLAUDE.md                     # Development guidelines
└── README.md                     # User documentation
```

---

## Entry Points & Startup Flow

### 1. Main Orchestrator: `src/index.ts`

**Function**: Central state machine that coordinates all subsystems.

**Startup Sequence**:
```
main()
├── ensureContainerSystemRunning()  # Check/start Apple Container
├── initDatabase()                  # Create SQLite schema
├── loadState()                     # Restore last_timestamp & sessions
├── WhatsAppChannel.connect()       # Connect to WhatsApp (Baileys)
├── startSchedulerLoop()            # Start scheduled task runner
├── startIpcWatcher()               # Start IPC file watcher
├── queue.setProcessMessagesFn()    # Register message processor
├── recoverPendingMessages()        # Resume on startup
└── startMessageLoop()              # Begin main message polling loop (infinite)
```

**Key State Variables**:
- `lastTimestamp`: Cursor for detecting new messages in DB
- `lastAgentTimestamp[groupJid]`: Per-group cursor (for trigger logic + context accumulation)
- `sessions[groupFolder]`: Session IDs for persistent agent state
- `registeredGroups[jid]`: Metadata (name, folder, trigger, container config)

### 2. Message Loop: `startMessageLoop()` (Non-Blocking)

**Interval**: Polls every 2 seconds (`POLL_INTERVAL`)

**Flow**:
```
Loop every 2s:
├── Query DB for new messages since lastTimestamp
├── For each new message group by chat_jid:
│   ├── Check if trigger present (unless main group or requiresTrigger=false)
│   ├── Accumulate context from lastAgentTimestamp[jid] onward
│   └── Queue for processing via GroupQueue
└── Sleep & repeat
```

**Key Logic**:
- Messages advance `lastTimestamp` immediately (atomic DB update)
- Per-group `lastAgentTimestamp` advanced only when agent successfully processes
- Non-main groups require `@{ASSISTANT_NAME}` trigger (regex configurable)
- Main group always processes (no trigger needed)

### 3. Package.json Scripts

```json
{
  "start": "node dist/index.js",              # Production (compiled)
  "dev": "tsx src/index.ts",                  # Development (hot reload)
  "auth": "tsx src/whatsapp-auth.ts",         # WhatsApp QR code authentication
  "build": "tsc",                             # Compile TypeScript
  "typecheck": "tsc --noEmit",                # Type checking
  "test": "vitest run",                       # Run tests
  "test:watch": "vitest"                      # Watch mode tests
}
```

---

## Core Abstractions & Message Flow

### 1. Channel Abstraction (`src/types.ts`)

```typescript
interface Channel {
  name: string;
  connect(): Promise<void>;
  sendMessage(jid: string, text: string): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean;
  disconnect(): Promise<void>;
  setTyping?(jid: string, isTyping: boolean): Promise<void>;
}
```

**Current Implementation**: `WhatsAppChannel`
- Uses `@whiskeysockets/baileys` (WhatsApp API)
- Multi-file auth state stored in `data/auth/`
- Callbacks: `onMessage()` → `storeMessage()`, `onChatMetadata()` → `updateChatName()`
- Outgoing queue with flushing on connection
- Auto-reconnect on disconnect

### 2. Message Flow

```
WhatsApp Server
     ↓
Baileys Socket
     ↓
onMessage callback
     ↓
storeMessage() → SQLite (messages table)
     ↓
Message Loop (polls every 2s)
     ↓
getNewMessages(jids, lastTimestamp) → SQLite query
     ↓
Check trigger (if needed)
     ↓
GroupQueue.enqueueMessageCheck(jid)
     ↓
GroupQueue.runForGroup() → processGroupMessages()
     ↓
formatMessages() → XML
     ↓
runContainerAgent() → spawn('container run ...')
     ↓
Container agent via SDK
     ↓
MCP IPC tool writes to /workspace/ipc/messages/
     ↓
Host's IPC watcher reads & sends via WhatsApp
     ↓
Agent output → WhatsApp
```

### 3. Container Abstraction (`src/container-runner.ts`)

**Purpose**: Spawn and manage isolated agent containers.

**Input Protocol**: JSON via stdin
```typescript
interface ContainerInput {
  prompt: string;              // XML-formatted messages
  sessionId?: string;          # Claude Code session to resume
  groupFolder: string;         # Group identifier
  chatJid: string;            # WhatsApp JID
  isMain: boolean;            # Is main group?
  isScheduledTask?: boolean;  # Flag for scheduled execution
  secrets?: Record<string, string>;  # API keys (never written to disk)
}
```

**Output Protocol**: JSON stdout between markers
```typescript
interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;      # Agent's text response
  newSessionId?: string;      # New session if created
  error?: string;             # Error message if failed
}
```

**Markers for Streaming**:
```
---NANOCLAW_OUTPUT_START---
{...ContainerOutput...}
---NANOCLAW_OUTPUT_END---
```

**Volume Mounts** (per-group isolation):

| Host Path | Container Path | RO | Purpose |
|-----------|----------------|----|---------|
| `PROJECT_ROOT` (main only) | `/workspace/project` | RW | Full project access for main |
| `groups/{folder}` | `/workspace/group` | RW | Group-specific data |
| `groups/global` (non-main) | `/workspace/global` | RO | Shared context |
| `data/sessions/{folder}/.claude` | `/home/node/.claude` | RW | Claude Code session + skills |
| `data/ipc/{folder}` | `/workspace/ipc` | RW | IPC messages & tasks |
| `container/agent-runner/src` | `/app/src` | RO | Agent code (recompiled on startup) |
| `{validated mounts}` | `/workspace/extra/{name}` | RO/RW | Additional user mounts |

**Lifecycle**:
1. Spawn: `container run -i --rm --name nanoclaw-{group}-{timestamp}`
2. Pass secrets via stdin (never written to disk)
3. Stream output markers → parse in real-time
4. Track session ID from init marker
5. Idle timeout after 30 mins of inactivity (configurable)
6. Hard timeout after 5 mins total (configurable per group)
7. Graceful stop → force kill if needed

### 4. Group Queue (`src/group-queue.ts`)

**Purpose**: Serialize container execution per group, enable concurrent groups.

**State Per Group**:
```typescript
interface GroupState {
  active: boolean;              # Is container currently running?
  pendingMessages: boolean;     # New messages arrived while active?
  pendingTasks: QueuedTask[];   # Queued scheduled tasks
  process: ChildProcess | null; # Container process
  containerName: string | null; # For debugging
  groupFolder: string | null;   # Group ID
  retryCount: number;           # Exponential backoff on failure
}
```

**Key Rules**:
- Max `MAX_CONCURRENT_CONTAINERS` (default 5) running simultaneously
- Each group runs one container at a time (serialized)
- When container exits: check pending tasks (priority 1) then pending messages (priority 2)
- Tasks execute from queue before messages to prevent starvation
- Exponential backoff on failure (5s, 10s, 20s, 40s, 80s)
- After 5 retries: drop and await next incoming trigger

**Shutdown Behavior**:
- Don't kill active containers (they have graceful timeouts)
- Mark as "shutting down" (reject new enqueues)
- Detach processes so WhatsApp reconnects don't interrupt long-running agents

### 5. IPC Watcher (`src/ipc.ts`)

**Purpose**: Bidirectional communication between agents and host.

**Poll Interval**: Every 1000ms

**Operations**:

1. **Message Sending** (agent → host → WhatsApp):
   ```
   /workspace/ipc/{group}/messages/*.json
   {
     "type": "message",
     "chatJid": "120xxxxx-1620xxxx@g.us",
     "text": "Hello from agent"
   }
   ```
   Authorization: Only main group can send to arbitrary JIDs; other groups can only send to their own JID

2. **Task Creation** (agent → scheduler):
   ```
   /workspace/ipc/{group}/tasks/*.json
   {
     "type": "schedule_task",
     "prompt": "Do something",
     "schedule_type": "cron|interval|once",
     "schedule_value": "0 9 * * *",
     "targetJid": "...",
     "context_mode": "group|isolated"
   }
   ```

3. **Task Control** (pause/resume/cancel):
   ```
   {"type": "pause_task", "taskId": "..."}
   {"type": "resume_task", "taskId": "..."}
   {"type": "cancel_task", "taskId": "..."}
   ```

4. **Group Management** (main only):
   ```
   {"type": "register_group", "jid": "...", "name": "...", "folder": "...", ...}
   {"type": "refresh_groups"}
   ```

**Authorization**:
- Main group: can perform all operations
- Non-main groups: can only operate on their own JID/folder
- Verified via IPC directory ownership (group folder name = source identity)

---

## WhatsApp Bridge (`src/channels/whatsapp.ts`)

**Library**: `@whiskeysockets/baileys` (WhatsApp API via reverse engineering)

**Key Features**:
- Multi-device auth (no phone needed, can use business account)
- QR code authentication → saved in `data/auth/`
- Automatic reconnect with exponential backoff
- Typing indicators (`setTyping()`)
- Group metadata sync every 24 hours

**Message Flow**:
1. Baileys receives message event
2. `onMessage` callback invokes `storeMessage()`
3. Message stored in SQLite with timestamp
4. Message loop picks up on next poll cycle

**Group Metadata**:
- Synced on startup and every 24 hours
- JID format: `{phone}-{timestamp}@g.us`
- Last sync timestamp tracked in `router_state` table

---

## Container Isolation (`src/container-runner.ts`)

### Filesystem Isolation

Each container sees a curated filesystem:
- **Main group** (`isMain=true`):
  - `/workspace/project`: Full project root (RW)
  - `/workspace/group`: Group-specific data (RW)
  - Can manage other groups via IPC

- **Non-main groups** (`isMain=false`):
  - `/workspace/group`: Own group folder only (RW)
  - `/workspace/global`: Shared CLAUDE.md (RO)
  - Can only see own group folder
  - Can only send messages to own JID

### Session Isolation

```
data/sessions/
├── main/.claude/          # Main group's Claude Code sessions
│   ├── settings.json      # SDK config (agent teams enabled)
│   ├── skills/            # Copied from container/skills/
│   └── transcript.jsonl   # Session transcript
├── groupname/.claude/     # Other groups' isolated sessions
└── ...
```

Each group gets its own `.claude/` mounted at `/home/node/.claude` in the container, ensuring:
- Session history isolated per group
- CLAUDE.md memory loaded per group
- Agent team state not shared across groups

### Mount Security (`src/mount-security.ts`)

**Design**: Allowlist stored OUTSIDE project root (`~/.config/nanoclaw/mount-allowlist.json`)

**Why Outside**:
- Containers cannot modify allowlist (tamper-proof)
- Users can control what groups access without code changes

**Validation**:
```typescript
interface MountAllowlist {
  allowedRoots: [
    { path: "~/projects", allowReadWrite: true, description: "..." }
  ],
  blockedPatterns: [".ssh", ".env", "credentials", "password"],
  nonMainReadOnly: true  // Force non-main groups read-only?
}
```

**Flow**:
1. Agent specifies `additionalMounts` in container config
2. Validator checks:
   - Path exists
   - Not under blocked pattern (.ssh, .env, .gnupg, etc.)
   - Under an allowed root
   - Honors nonMainReadOnly for non-main groups
3. Mounted at `/workspace/extra/{name}/`

**Default Blocked Patterns**:
`.ssh, .gnupg, .gpg, .aws, .azure, .gcloud, .kube, .docker, credentials, .env, .netrc, .npmrc, .pypirc, id_rsa, id_ed25519, private_key, .secret`

---

## Agent Swarms & Multi-Agent Teams

### Claude Agent SDK Integration

**SDK Configuration** (`container/agent-runner/src/index.ts`):

```typescript
const options = {
  cwd: '/workspace/group',
  additionalDirectories: extraDirs,  // From /workspace/extra/*
  resume: sessionId,                 // Resume conversation
  systemPrompt: { type: 'preset', preset: 'claude_code', append: globalClaudeMd },
  allowedTools: [
    'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
    'WebSearch', 'WebFetch',
    'Task', 'TaskOutput', 'TaskStop',
    'TeamCreate', 'TeamDelete', 'SendMessage',  # ← Agent swarm tools
    'TodoWrite', 'ToolSearch', 'Skill',
    'NotebookEdit',
    'mcp__nanoclaw__*'  # MCP tools
  ],
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
  settingSources: ['project', 'user'],
  mcpServers: {
    nanoclaw: { ... }  # Custom MCP server for IPC
  },
  hooks: {
    PreCompact: [createPreCompactHook()],      # Archive conversations
    PreToolUse: [createSanitizeBashHook()]    # Strip secrets from Bash env
  }
};

for await (const message of query({prompt: stream, options})) {
  // Stream results as they arrive
  if (message.type === 'result') {
    writeOutput({status: 'success', result: message.result});
  }
}
```

**Agent Swarm Features**:
- `TeamCreate`: Agent spawns subagents
- `TeamDelete`: Terminates team
- `SendMessage`: Subagents communicate
- All subagents inherit the same environment, working directory, and available tools
- Subagents can access shared CLAUDE.md memory

### SDK Environment Variables

Set in `data/sessions/{group}/.claude/settings.json`:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",  # Enable subagents
    "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD": "1",  # Load from /workspace/extra/*
    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0"  # Enable auto-memory
  }
}
```

### Streaming Results

**MessageStream Class**:
- Async iterable that stays alive (prevents `isSingleUserTurn` optimization)
- Messages pushed as they arrive from host
- Allows agent to keep thinking and respond to follow-ups

**IPC Message Piping During Query**:
```
1. Agent starts query with initial prompt
2. IPC watcher polls for follow-up messages
3. New messages written to /workspace/ipc/input/*.json
4. Agent reads them via drainIpcInput()
5. Messages pushed to MessageStream
6. Agent continues conversation
7. _close sentinel ends the stream
```

---

## Scheduled Tasks (`src/task-scheduler.ts`)

**Purpose**: Run agents on a schedule (cron, interval, or once).

**Database Schema**:
```typescript
interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;  // "0 9 * * *" or "300000" or ISO timestamp
  context_mode: 'group' | 'isolated';  // Reuse group session or new?
  next_run: string | null;  // ISO timestamp
  last_run: string | null;
  last_result: string | null;  // Truncated
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}
```

**Poll Interval**: Every 60 seconds

**Schedule Parsing**:
- `cron`: Uses `cron-parser` with timezone support
- `interval`: Milliseconds (e.g., 300000 = 5 minutes)
- `once`: ISO timestamp (runs once, then status='completed')

**Context Modes**:
- `group`: Reuse group's existing session (persistent state)
- `isolated`: New session just for this task (no history pollution)

**Execution**:
1. Get due tasks: `next_run <= now && status='active'`
2. Queue via `GroupQueue.enqueueTask(jid, taskId, fn)`
3. Run in isolated container (same as message processing)
4. Log result to `task_run_logs` table
5. Calculate next_run based on schedule_type
6. Update task with `next_run` and `last_result`

**Idempotency**: Each task run is independent; if a task crashes, it's retried via normal queue backoff.

---

## Database Schema (`src/db.ts`)

**SQLite File**: `data/nanoclaw.db`

### Tables

**chats**
```
jid (TEXT PRIMARY KEY): WhatsApp JID
name (TEXT): Group name
last_message_time (TEXT): Timestamp of most recent activity
```

**messages**
```
id (TEXT): WhatsApp message ID
chat_jid (TEXT): Parent chat
sender (TEXT): Sender phone
sender_name (TEXT): Display name
content (TEXT): Message text
timestamp (TEXT): ISO timestamp
is_from_me (INTEGER): 1 if assistant sent
is_bot_message (INTEGER): 1 if marker
```

**scheduled_tasks**
```
id (TEXT PRIMARY KEY)
group_folder, chat_jid, prompt, schedule_type, schedule_value
context_mode: 'group' | 'isolated'
next_run, last_run, last_result, status, created_at
```

**task_run_logs**
```
task_id (TEXT): Foreign key to scheduled_tasks
run_at, duration_ms, status ('success'|'error'), result, error
```

**router_state**
```
key (TEXT): 'last_timestamp' or 'last_agent_timestamp'
value (TEXT): Serialized state
```

**sessions**
```
group_folder (TEXT PRIMARY KEY): Group identifier
session_id (TEXT): Claude Code session ID
```

**registered_groups**
```
jid (TEXT PRIMARY KEY): WhatsApp JID
name, folder (UNIQUE), trigger_pattern, added_at
container_config (JSON): Additional mounts & timeouts
requires_trigger (INTEGER): Default true for groups
```

---

## Dependencies

### Production Dependencies

```json
{
  "@whiskeysockets/baileys": "^7.0.0-rc.9",  # WhatsApp API
  "better-sqlite3": "^11.8.1",               # SQLite (sync wrapper)
  "cron-parser": "^5.5.0",                   # Cron schedule parsing
  "pino": "^9.6.0",                          # Logging
  "pino-pretty": "^13.0.0",                  # Pretty log formatting
  "qrcode": "^1.5.4",                        # QR code generation
  "qrcode-terminal": "^0.12.0",              # Terminal QR display
  "zod": "^4.3.6"                            # Data validation
}
```

### Container Dependencies

```json
{
  "@anthropic-ai/claude-agent-sdk": "^X.X.X",  # Agent execution
  "@anthropic-ai/claude-code": "global npm",   # Claude Code tools
  "agent-browser": "global npm"                # Browser automation
}
```

### System Dependencies

- **Apple Container**: Required for Linux VMs (macOS only, not Docker)
- **Node.js**: >=20 (host)
- **Chromium**: In container for browser automation

---

## Key Design Decisions

### 1. Single Orchestrator Process

**Decision**: One Node.js process coordinates all subsystems.

**Rationale**:
- Simpler state management (no distributed consensus)
- Easy to restart service (launchd can auto-restart)
- Shared SQLite DB avoids multi-process locking complexity

**Trade-off**: Orchestrator is single point of failure (but has graceful shutdown)

### 2. Per-Group Container Isolation

**Decision**: Each group's agent runs in a separate container with isolated mounts.

**Rationale**:
- Prevents accidental data leaks between groups
- Groups can't escalate privileges across IPC
- Allows future per-group permission models

**Implementation**:
- Mount only group's own folder
- Separate `.claude/` sessions per group
- Separate IPC namespaces per group
- Main group special: full project access

### 3. File-Based IPC

**Decision**: IPC via JSON files in `/workspace/ipc/{group}/` directories.

**Rationale**:
- No additional services needed
- Survives container restarts (messages persist)
- Host can watch files for completion
- No socket permissions issues

**Alternative Rejected**: stdin/stdout pipes would lose messages on container death

### 4. Mount Allowlist Outside Project

**Decision**: Allowlist stored at `~/.config/nanoclaw/mount-allowlist.json`.

**Rationale**:
- Prevents container agents from modifying security config
- Users can manage permissions without code access
- Survives project resets

**Validation**: Every mount check reloads from disk (cached), preventing TOCTOU

### 5. XML Formatting for Messages

**Decision**: Messages formatted as XML for agent context.

**Rationale**:
- Distinguishes message structure from content
- Allows escaping of special characters
- Human-readable in agent logs

```xml
<messages>
  <message sender="Alice" time="2026-02-17T10:00:00Z">Hello!</message>
  <message sender="Bob" time="2026-02-17T10:01:00Z">Hi there</message>
</messages>
```

### 6. Trigger-Based vs. Always-Active

**Decision**: Non-main groups require `@{ASSISTANT_NAME}` trigger.

**Rationale**:
- Reduces noise (agent doesn't respond to every message)
- Messages accumulate as context (sent as full batch when triggered)
- Main group processes all messages (always-active assistant)

**Configuration**: `requiresTrigger` field in group config (default: true)

### 7. Session Persistence Per Group

**Decision**: Claude Code sessions stored per group, not globally.

**Rationale**:
- Groups maintain independent conversation histories
- CLAUDE.md memories isolated per group
- Prevents cross-group context pollution

**Alternative**: Single shared session (rejected — privacy & clarity)

### 8. Graceful Container Shutdown

**Decision**: Don't kill containers on orchestrator shutdown; let them timeout.

**Rationale**:
- If agent is computing, killing wastes work
- Messages already sent to user shouldn't be lost
- Graceful exit via idle timeout is more reliable

**Mechanism**: Idle timeout after 30 mins, hard timeout after 5 mins configured

---

## Configuration & Environment

### Environment Variables

**Required** (in `.env` or process.env):
```bash
ASSISTANT_NAME=Andy           # Name for trigger @Andy
ASSISTANT_HAS_OWN_NUMBER=false  # If true, uses own WhatsApp account
```

**Optional**:
```bash
POLL_INTERVAL=2000            # Message poll interval (ms)
SCHEDULER_POLL_INTERVAL=60000 # Task scheduler interval (ms)
IDLE_TIMEOUT=1800000          # Container idle timeout (ms, 30 min default)
CONTAINER_TIMEOUT=1800000     # Hard container timeout (5 min default overridden by idle)
MAX_CONCURRENT_CONTAINERS=5   # Max parallel agents
CONTAINER_IMAGE=nanoclaw-agent:latest
LOG_LEVEL=info                # Logging level
TZ=America/Los_Angeles        # Timezone for cron schedules
```

### Mount Allowlist (`~/.config/nanoclaw/mount-allowlist.json`)

Example:
```json
{
  "allowedRoots": [
    {"path": "~/projects", "allowReadWrite": true},
    {"path": "~/repos", "allowReadWrite": false}
  ],
  "blockedPatterns": ["password", "secret"],
  "nonMainReadOnly": true
}
```

### Group Configuration

Stored in `registered_groups` table:
```typescript
interface RegisteredGroup {
  name: string;                    # "Work Team"
  folder: string;                  # Unique folder name
  trigger: string;                 # @Andy (for historical compat)
  added_at: string;                # ISO timestamp
  containerConfig?: {
    additionalMounts?: [{
      hostPath: "~/projects/secret",
      containerPath: "secret",  # Optional
      readonly?: true
    }],
    timeout?: 300000  # Override default timeout
  },
  requiresTrigger?: boolean;  # Default: true
}
```

---

## Service Management (macOS)

### LaunchAgent (`launchd/com.nanoclaw.plist`)

Configuration for auto-start on login:
```xml
<dict>
  <key>Label</key>
  <string>com.nanoclaw</string>
  <key>ProgramArguments</key>
  <array>
    <string>{{NODE_PATH}}</string>
    <string>{{PROJECT_ROOT}}/dist/index.js</string>
  </array>
  <key>RunAtLoad</key>
  <true/>  <!-- Start on login -->
  <key>KeepAlive</key>
  <true/>  <!-- Restart if crashes -->
  <key>StandardOutPath</key>
  <string>{{PROJECT_ROOT}}/logs/nanoclaw.log</string>
</dict>
```

### Management

```bash
# Install
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# Uninstall
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

# Check status
launchctl list | grep nanoclaw

# View logs
tail -f ~/nanoclaw/logs/nanoclaw.log
```

---

## Security Considerations

### Secrets Handling

1. **API Keys**: Passed via stdin (never written to disk)
   ```typescript
   input.secrets = readSecrets(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']);
   container.stdin.write(JSON.stringify(input));
   delete input.secrets;  // Remove from logs
   ```

2. **Bash Command Sanitization**: Strip secrets from Bash subprocess env
   ```typescript
   // PreToolUse hook prepends: unset ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN
   ```

3. **Session Isolation**: Sessions stored in `data/sessions/` (not mounted)
   - Only current session accessible to container
   - Previous sessions stored as transcripts

### Group Isolation

1. **Filesystem**: Each group sees only its own folder
2. **IPC**: Authorization checks in `processTaskIpc()`
3. **Network**: No cross-container networking (not relevant)

### Mount Security

1. **Allowlist**: External file prevents tampering
2. **Patterns**: Blocks `.ssh`, `.env`, credentials, etc.
3. **Non-main Enforcement**: Can force read-only for safety
4. **Path Validation**: Prevents `../` escaping

---

## Performance Characteristics

### Message Latency

- Poll interval: 2 seconds (configurable)
- Container startup: 2-5 seconds (image cached)
- Agent query: Variable (depends on Claude response time)
- **E2E**: 5-10 seconds typical (WhatsApp poll → agent response → WhatsApp send)

### Concurrency

- Max concurrent containers: 5 (configurable)
- Queue depth: Unlimited (disk-bound)
- Per-group serialization: Prevents race conditions

### Storage

- SQLite DB: Grows with message count (~1KB per message with indexes)
- Session transcripts: Compressed, archived periodically
- Container logs: Per-group, auto-rotated

---

## Debugging & Troubleshooting

### Logs

```bash
# Main process logs
tail -f logs/nanoclaw.log
tail -f logs/nanoclaw.error.log

# Container logs (per group)
ls groups/{name}/logs/
cat groups/{name}/logs/container-2026-02-17-10-30-45.log

# IPC errors
ls data/ipc/errors/
```

### Common Issues

1. **Container won't start**: Check `container system status`
2. **Messages not processed**: Check `router_state` table (`last_timestamp`)
3. **Agent session lost**: Check `sessions` table (missing session_id)
4. **Mount validation fails**: Check `~/.config/nanoclaw/mount-allowlist.json`
5. **Task not running**: Check `scheduled_tasks.next_run <= now` and `status='active'`

### Database Inspection

```bash
# Browse SQLite
sqlite3 data/nanoclaw.db

# Check last message timestamp
SELECT last_timestamp FROM router_state;

# Check group registrations
SELECT * FROM registered_groups;

# Check sessions
SELECT * FROM sessions;
```

---

## Future Extension Points

### 1. Additional Channels

Implement new `Channel` subclasses for Telegram, Discord, etc.

```typescript
export class TelegramChannel implements Channel {
  // ... same interface
}
```

### 2. Custom MCP Tools

Add to `container/skills/` for agents to use.

Example: `agent-browser` already included for web automation.

### 3. Group-Specific Permissions

Extend `containerConfig` with role-based ACLs:
```typescript
containerConfig: {
  permissions: {
    canScheduleTasks: true,
    canRegisterGroups: false,
    canAccessProject: false
  }
}
```

### 4. Message Archival

Implement S3/cloud backup of transcripts.

### 5. Metrics & Analytics

Track agent usage, response times, costs.

---

## Summary

NanoClaw is a well-architected system that bridges WhatsApp messaging with Claude's Agent SDK in a secure, isolated manner. Key innovations:

1. **Single orchestrator** managing complex state without distributed consensus
2. **Per-group container isolation** preventing privilege escalation
3. **File-based IPC** surviving crashes and container restarts
4. **External mount allowlist** tamper-proof security configuration
5. **Agent swarms** enabled via SDK's team tools with proper isolation
6. **Scheduled task scheduling** with flexible cron/interval/once patterns
7. **Graceful degradation** on failures with exponential backoff

The architecture scales to 5+ concurrent agents while maintaining strict per-group isolation and security boundaries.
