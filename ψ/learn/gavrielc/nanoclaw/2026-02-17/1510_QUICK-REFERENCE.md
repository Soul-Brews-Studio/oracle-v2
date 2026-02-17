# NanoClaw Quick Reference Guide

**Last Updated:** 2026-02-17
**Version:** 1.0.0

---

## What Is NanoClaw?

NanoClaw is a personal Claude assistant that runs securely in containers and connects via WhatsApp. It's intentionally lightweight (one Node.js process, ~8 minutes to understand the codebase) and built with OS-level isolation rather than application-level permission checks. Unlike larger frameworks like OpenClaw, NanoClaw prioritizes security, simplicity, and the ability for one person to understand and customize it. It's AI-native by design—setup and debugging are done with Claude Code, not configuration files or dashboards.

---

## Prerequisites

### Operating System & Container Runtime
- **macOS**: Apple Container (recommended, lightweight) OR Docker Desktop
- **Linux**: Docker (required)

### Required Software
- **Node.js**: 20+
- **Claude Code**: Latest version (handles everything: dependencies, auth, container setup, service configuration)
- **WhatsApp**: Active account on your phone (used for I/O via Baileys protocol)

### Anthropic Authentication
One of:
- **Claude Subscription** (Pro/Max) with OAuth token from `claude setup-token`
- **Anthropic API Key** (pay-per-use) from [console.anthropic.com](https://console.anthropic.com)

---

## Installation Steps

### 1. Clone & Initial Setup

```bash
git clone https://github.com/gavrielc/nanoclaw.git
cd nanoclaw
claude
```

### 2. Run `/setup` Skill

The `/setup` skill automates everything:
- **Environment Check** - Verifies Node.js, container runtime, and existing config
- **Dependency Installation** - Installs npm packages (baileys, better-sqlite3, zod, etc.)
- **Container Setup** - Builds the agent image (Apple Container or Docker)
- **Claude Authentication** - Configures `.env` with API credentials
- **WhatsApp Authentication** - Scans QR code to establish session
- **Main Channel Registration** - Sets up your private self-chat for admin control

**Process:**
1. Claude Code guides through each step
2. Some steps (QR code, API key paste) require your action
3. The skill pauses when input is needed, then resumes automatically

### 3. Verify Installation

```bash
npm run dev          # Run with hot reload to test locally
# or
node dist/index.js   # Run compiled version
```

Watch for:
- WhatsApp connection: "connection.open event received"
- Message polling loop: "Started message polling loop"
- Scheduler loop: "Started scheduler loop"

---

## The `/setup` Workflow Breakdown

When you run `/setup`, it executes these phases:

### Phase 1: Environment Validation
- Checks if Node.js 20+ is installed
- Detects container runtime (Apple Container vs Docker)
- Checks for existing authentication and registered groups
- Proposes: skip steps if already configured, or reconfigure

### Phase 2: Dependencies
- Runs `npm install`
- Installs: baileys (WhatsApp), better-sqlite3 (database), cron-parser, zod (validation)
- If native module build fails (better-sqlite3), suggests installing build tools

### Phase 3: Container Runtime
- **On macOS:** Offers Apple Container (preferred) or Docker
  - Apple Container: Lightweight Linux VMs, optimal for Apple silicon
  - Docker: Universal but heavier
- **On Linux:** Uses Docker (only option)
- Builds the `nanoclaw-agent:latest` image from `container/Dockerfile`

### Phase 4: Claude Authentication
- Guides to run `claude setup-token` (for subscription) or retrieves API key (for pay-per-use)
- Writes credentials to `.env`: `CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...` or `ANTHROPIC_API_KEY=sk-ant-api03-...`
- Only these two environment variables are mounted to containers (for security)

### Phase 5: WhatsApp QR Code
- Starts WhatsApp connection
- Displays QR code in terminal
- You scan with your phone to authenticate
- Session stored in `store/auth/` (persistent ~20 days)

### Phase 6: Main Channel Registration
- Registers your self-chat as the "main" channel
- This is your private admin space (can manage groups, schedule for others, configure)
- Tested by sending a message: `@Andy [trigger word] hello`

### Phase 7: macOS Service Setup (Optional)
- Installs launchd service at `~/Library/LaunchAgents/com.nanoclaw.plist`
- Service auto-starts on boot and keeps NanoClaw running
- Logs to `logs/nanoclaw.log` and `logs/nanoclaw.error.log`

---

## Configuration & Customization

### Trigger Word (Default: `@Andy`)

**Change with environment variable:**
```bash
ASSISTANT_NAME=Bob npm start
```

Or edit `src/config.ts`:
```typescript
export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Andy';
```

**Usage:**
- Messages must start with trigger: `@Andy what's the weather?`
- Case insensitive: `@andy` works too
- Response is prefixed: `Andy: [response]`

### Configuration in `src/config.ts`

```typescript
export const ASSISTANT_NAME = 'Andy';       // Trigger word & response prefix
export const POLL_INTERVAL = 2000;          // Check SQLite for messages every 2s
export const SCHEDULER_POLL_INTERVAL = 60000; // Check scheduled tasks every 1 min
export const CONTAINER_TIMEOUT = 1800000;   // 30 min agent timeout
export const IDLE_TIMEOUT = 1800000;        // Keep container alive 30 min after response
export const MAX_CONCURRENT_CONTAINERS = 5; // Max parallel agents running
```

**Paths (all absolute, required for container mounts):**
```typescript
const PROJECT_ROOT = process.cwd();
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
```

### No Configuration Files

There are no YAML, JSON, or INI config files. Instead:
- Tell Claude Code what you want: `"Change the trigger word to @Bot"`
- Or run `/customize` for guided changes
- Or modify source code directly (codebase is small enough to be safe)

---

## Key Commands & Usage Patterns

### Talk to Claude (Any Group)

```
@Andy [message]
```

Examples:
```
@Andy send an overview of the sales pipeline every weekday morning at 9am
@Andy review the git history for the past week and update the README
@Andy what time is it in Tokyo?
```

### Admin Commands (Main Channel Only)

```
@Andy add group "Family Chat"           # Register a new WhatsApp group
@Andy remove group "Work Team"          # Unregister a group
@Andy list groups                       # Show all registered groups
@Andy remember I prefer dark mode       # Add to global memory (CLAUDE.md)

@Andy list all tasks                    # Show all scheduled tasks
@Andy pause task [id]                   # Pause a task
@Andy resume task [id]                  # Resume paused task
@Andy cancel task [id]                  # Delete a task
```

### Service Management (macOS)

```bash
# Start
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

# Check status
launchctl list | grep nanoclaw

# View logs
tail -f logs/nanoclaw.log
tail -f logs/nanoclaw.error.log
```

### Development

```bash
npm run dev          # Run with hot reload (tsx)
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Check types without building
npm run format       # Auto-format code with Prettier
npm test             # Run test suite (vitest)
./container/build.sh # Rebuild agent container image
```

---

## How Groups Work

### Group Isolation

Each WhatsApp group (or self-chat) is registered and isolated:

| Aspect | Main Channel | Other Groups |
|--------|-------------|-------------|
| **Folder** | `groups/main/` | `groups/{group-name}/` |
| **Memory** | Can read/write global + main | Can read global (read-only), write own |
| **Filesystem** | `/workspace/project/` (rw) + `/workspace/group/` (rw) | `/workspace/group/` (rw) only |
| **Container Mounts** | Configurable | Configurable (read-only default) |
| **Cross-group Messages** | Can message any group | Can only message self |
| **Schedule Tasks** | For any group | For self only |
| **Capabilities** | All tools | All tools |

### Main Channel vs. Other Groups

**Main Channel** (`groups/main/`):
- Your self-chat with the assistant
- Admin control: register/remove groups, schedule for others, manage configuration
- Can read and write global memory (`groups/CLAUDE.md`)
- Can configure additional filesystem mounts for other groups

**Other Groups** (e.g., `groups/Family Chat/`):
- Registered WhatsApp groups
- Isolated memory (`groups/{name}/CLAUDE.md`)
- Cannot see other groups' messages or files
- Cannot write to global memory (main only)
- Can read global memory (for shared facts/preferences)

### Memory Files

**Global Memory** (`groups/CLAUDE.md`):
- Shared across all groups
- Updated only by main channel
- Example: "I prefer dark theme", "My phone is +1-555-0100"

**Group Memory** (`groups/{name}/CLAUDE.md`):
- Specific to that group
- Each group maintains its own context and conversation history
- Example: "Family Chat prefers short responses", "Work Team knows about ProjectX"

**Session Data** (`data/sessions/{group}/.claude/`):
- Full conversation transcript (JSONL format)
- Allows Claude to remember previous conversations
- Persists session ID in SQLite for resumption

---

## Scheduled Tasks

### How They Work

Tasks run Claude as a full agent in the group's context. They can:
- Search the web
- Read/write files
- Run bash commands (in container)
- Send messages to the group via `send_message` tool
- Create other tasks

### Schedule Types

| Type | Format | Example |
|------|--------|---------|
| **Cron** | Cron expression | `0 9 * * 1` (Monday 9am) |
| **Interval** | Milliseconds | `3600000` (every hour) |
| **Once** | ISO timestamp | `2024-12-25T09:00:00Z` |

### Creating a Task

User says:
```
@Andy remind me every Monday at 9am to review the weekly metrics
```

Claude calls:
```json
{
  "tool": "mcp__nanoclaw__schedule_task",
  "prompt": "Send a reminder to review weekly metrics. Be encouraging!",
  "schedule_type": "cron",
  "schedule_value": "0 9 * * 1"
}
```

Result: Task stored in SQLite, runs at 9am Monday, sends response to group.

### Managing Tasks

From any group:
```
@Andy list my scheduled tasks          # Show tasks for this group only
@Andy pause task [id]                  # Pause execution
@Andy resume task [id]                 # Resume
@Andy cancel task [id]                 # Delete
```

From main only:
```
@Andy list all tasks                   # Show all tasks, all groups
@Andy schedule task for "Family Chat": [prompt]
```

### Task Execution

1. Scheduler loop polls SQLite every 60 seconds
2. When task is due, container spawns with group's working directory and memory
3. Task runs the prompt as a full agent query
4. Results are logged to `groups/{folder}/logs/task-{id}.log`
5. If task calls `send_message`, response is sent to the group

---

## Container Setup

### Apple Container (macOS, Recommended)

**Lightweight Linux VMs**, optimized for Apple silicon.

**Installation:**
- Download from [github.com/apple/container](https://github.com/apple/container/releases)
- Install the `.pkg` file
- Verify: `container --version`

**Build & Run:**
```bash
# Build agent image
./container/build.sh

# Manually test
container run -i --rm -v ~/nanoclaw/groups/main:/workspace/group nanoclaw-agent:latest
```

**Service Start:**
NanoClaw auto-starts the container system on `npm start`. The code runs:
```bash
container system status          # Check if running
container system start           # Start if needed
container ps -a                  # Kill orphaned containers from previous runs
```

**Cache Issues:**
buildkit caches aggressively. To force clean rebuild:
```bash
container builder stop
container builder rm
container builder start
./container/build.sh
```

### Docker (macOS/Linux)

**Standard container runtime**, universal but heavier.

**Installation:**
- macOS: `brew install --cask docker` or download Docker Desktop
- Linux: `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER`

**Build & Run:**
```bash
# Build agent image
docker build -t nanoclaw-agent:latest container/

# Manually test
docker run -i --rm -v ~/nanoclaw/groups/main:/workspace/group nanoclaw-agent:latest
```

**Convert from Apple Container:**
Run the `/convert-to-docker` skill to automatically update the source code.

---

## Agent Swarms

**NanoClaw is the first personal AI assistant to support Agent Swarms.**

Agents can spawn teams of specialized agents that collaborate on complex tasks.

**Example:** User asks for a complex research task:
```
@Andy create a swarm to research AI safety, write a report, and schedule follow-ups
```

Claude can:
1. Create a team with specialized agents (researcher, writer, scheduler)
2. Delegate tasks to each agent
3. Collect results and synthesize into a single response

**How to Use:**
- Within an agent prompt, use the Claude Agent SDK to `spawn` agents
- Each agent gets its own isolated container with mounted directories
- Agents communicate via the Agent SDK's native team APIs
- Results are aggregated and sent back to the user

**Limitations:**
- Swarms can only be created from within an agent (not directly from WhatsApp)
- All agents run in the same group's context (same memory, filesystem)
- Swarms inherit the concurrency limit (`MAX_CONCURRENT_CONTAINERS`)

---

## Skills System (Extending NanoClaw)

### Philosophy

Don't add features to the codebase. Instead, contribute **skills** that transform a NanoClaw installation.

**Skills are:**
- Markdown files in `.claude/skills/{name}/SKILL.md`
- Markdown instructions (not code files)
- Executable via `/skill-name` from Claude Code

**Example Skills:**
- `/add-gmail` - Gmail integration (tool or channel mode)
- `/add-telegram` - Add Telegram as a channel
- `/add-slack` - Add Slack support
- `/add-voice-transcription` - Whisper voice transcription
- `/x-integration` - X/Twitter integration
- `/convert-to-docker` - Switch from Apple Container to Docker
- `/add-parallel` - Parallel agent execution

### How Skills Work

Running `/add-gmail` (example):
1. Skill is loaded by Claude Code
2. Claude reads the SKILL.md instructions
3. Claude asks you questions (e.g., "Tool mode or Channel mode?")
4. Claude makes code changes to `src/` to add the integration
5. Claude rebuilds the container image
6. You now have Gmail support without extra bloat

### Creating Your Own Skill

1. Create `.claude/skills/my-skill/SKILL.md`
2. Write markdown instructions that Claude will follow
3. Include:
   - What changes to make (files to modify)
   - Validation steps (how to test)
   - Rollback instructions (if something breaks)

**Example structure:**
```markdown
---
name: my-feature
description: What this adds
---

# My Feature Skill

## Step 1: Modify Code
[Instructions for Claude to update src/channels/...]

## Step 2: Test
[How to verify the feature works]

## Step 3: Rebuild
[Container rebuild instructions]
```

---

## Troubleshooting Tips

### "No response to messages"

Check if service is running:
```bash
launchctl list | grep nanoclaw    # macOS
ps aux | grep 'node.*dist/index'  # macOS/Linux
```

Start it:
```bash
npm run dev    # For testing
# or
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist  # macOS service
```

Check logs:
```bash
tail -f logs/nanoclaw.log
tail -f logs/nanoclaw.error.log
```

### "Claude Code process exited with code 1"

This usually means the container failed to start. Check:

1. **Is the container runtime running?**
   ```bash
   # Apple Container
   container system status

   # Docker
   docker info
   ```

2. **Check container logs:**
   ```bash
   # Find recent logs
   grep -r "error\|failed" logs/

   # Check the specific container log
   tail logs/nanoclaw.error.log
   ```

3. **Rebuild the container:**
   ```bash
   ./container/build.sh    # Apple Container
   # or
   docker build -t nanoclaw-agent:latest container/
   ```

### "QR code expired"

WhatsApp sessions last ~20 days. To re-authenticate:
```bash
rm -rf store/auth/    # Delete old session
npm run dev           # Will show new QR code
```

### "No groups registered"

Use the admin command in main channel:
```
@Andy add group "Family Chat"
```

Or register programmatically by asking Claude in main channel:
```
@Andy can you register these groups for me? [list them]
```

### Session Not Continuing

Claude should resume your previous conversation. If not:

**Check:**
```bash
sqlite3 store/messages.db "SELECT * FROM sessions"
```

**Verify mount path is correct:**
Sessions must be mounted to `/home/node/.claude/` (the `node` user's home, not root).

**Reset session:**
```bash
rm -rf data/sessions/{group}/.claude/    # Delete old session
```

### Container Build Cache Issues

Apple Container's buildkit can cache stale files even with `--no-cache`:

```bash
# Force clean rebuild
container builder stop
container builder rm
container builder start
./container/build.sh

# Verify
container run -i --rm --entrypoint wc nanoclaw-agent:latest -l /app/src/index.ts
```

### Skills Not Appearing

Check `.claude/skills/` directory structure:
```bash
ls -la .claude/skills/
# Should see: add-gmail/, add-telegram/, debug/, etc.
# Each should have: SKILL.md
```

If skills don't load in Claude Code, run:
```bash
claude      # Re-init Claude Code context
```

---

## Key Files to Know About

### Source Code

| File | Purpose |
|------|---------|
| `src/index.ts` | **Orchestrator**: State management, message loop, WhatsApp polling, container spawning |
| `src/channels/whatsapp.ts` | WhatsApp connection, Baileys auth, message send/receive |
| `src/ipc.ts` | IPC watcher (file-based), task processing from containers |
| `src/router.ts` | Message routing, conversation catch-up, response formatting |
| `src/config.ts` | Configuration constants (trigger word, timeouts, paths) |
| `src/container-runner.ts` | Spawns agents in Apple Container/Docker with volume mounts |
| `src/task-scheduler.ts` | Cron/interval job execution, task lifecycle management |
| `src/db.ts` | SQLite operations (groups, messages, sessions, tasks, state) |
| `src/mount-security.ts` | Mount allowlist validation (prevents unauthorized access) |
| `src/group-queue.ts` | Per-group message queue, global concurrency control |

### Container & Agent

| File | Purpose |
|------|---------|
| `container/Dockerfile` | Container image definition (Node.js + Claude Code CLI) |
| `container/build.sh` | Build script for container image |
| `container/agent-runner/src/index.ts` | **Agent entry point**: Runs inside container, queries Claude, polls IPC |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | Stdio-based MCP server (host ↔ agent communication) |
| `container/skills/agent-browser/SKILL.md` | Browser automation tool (available in all agents) |

### Configuration & Memory

| File | Purpose |
|------|---------|
| `.env` | Credentials (CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY) |
| `groups/CLAUDE.md` | **Global memory**: Shared across all groups |
| `groups/main/CLAUDE.md` | Main channel memory (admin context) |
| `groups/{name}/CLAUDE.md` | **Group-specific memory** |
| `groups/{name}/*.md` | Files created by agents (notes, research, docs) |
| `launchd/com.nanoclaw.plist` | macOS service definition |

### Data

| Directory | Purpose |
|-----------|---------|
| `store/auth/` | WhatsApp session state (Baileys) |
| `store/messages.db` | SQLite: messages, groups, sessions, tasks, state |
| `data/sessions/{group}/.claude/` | Agent session transcripts (JSONL) |
| `data/env/env` | Copy of .env (filtered, mounted to containers) |
| `data/ipc/` | IPC messages from agents (messages/, tasks/) |
| `logs/` | Runtime logs (nanoclaw.log, nanoclaw.error.log) |
| `groups/{name}/logs/` | Per-group container execution logs |

### Skills

| File | Purpose |
|------|---------|
| `.claude/skills/setup/SKILL.md` | First-time installation and configuration |
| `.claude/skills/customize/SKILL.md` | Guided customization (trigger word, behavior, etc.) |
| `.claude/skills/debug/SKILL.md` | Troubleshooting container and connection issues |
| `.claude/skills/add-gmail/SKILL.md` | Gmail integration (tool or channel mode) |
| `.claude/skills/add-telegram/SKILL.md` | Telegram channel support |
| `.claude/skills/convert-to-docker/SKILL.md` | Convert from Apple Container to Docker |
| `.claude/skills/add-voice-transcription/SKILL.md` | Whisper voice transcription |

---

## Message Flow Overview

```
User sends WhatsApp message
           ↓
Baileys receives via WhatsApp Web
           ↓
Message stored in SQLite
           ↓
Message loop polls SQLite (every 2s)
           ↓
Router checks: Is group registered? Does message match trigger?
           ↓
Router fetches all messages since last agent interaction
           ↓
Router invokes Claude Agent SDK in container:
  • cwd: groups/{group}/
  • Mounts: group folder, global memory, session data
  • Session: resumed from previous conversation
  • Tools: Bash, file ops, web search, MCP servers
           ↓
Claude processes message with tools as needed
           ↓
Router formats response with assistant name prefix
           ↓
Router sends via WhatsApp
           ↓
Router updates last interaction timestamp & saves session ID
```

---

## Security Model

### Isolation Layers

1. **Container Isolation (Primary)**
   - Agents run in isolated Linux containers (Apple Container or Docker)
   - Only explicitly mounted directories are visible
   - Bash commands run inside container, not on host
   - Non-root user (`node` uid 1000)
   - Ephemeral containers (`--rm` after each use)

2. **Mount Security**
   - External allowlist at `~/.config/nanoclaw/mount-allowlist.json`
   - Blocked patterns: `.ssh`, `.gnupg`, `.aws`, `.env`, credentials
   - Symlink resolution before validation (prevents traversal)
   - Non-main groups get read-only mounts by default

3. **Session Isolation**
   - Each group has separate session at `data/sessions/{group}/.claude/`
   - Groups cannot see other groups' conversation history

4. **IPC Authorization**
   - Message operations checked against group identity
   - Non-main groups cannot message other groups or schedule for others

### Trust Model

| Entity | Trust Level | Notes |
|--------|-------------|-------|
| Main group | Trusted | Your private admin channel |
| Other groups | Untrusted | External users may be malicious |
| Container agents | Sandboxed | Isolated execution, limited access |
| WhatsApp messages | User input | Potential prompt injection risk |

**Recommendations:**
- Only register trusted groups
- Review additional directory mounts carefully
- Monitor logs for unusual activity
- Review scheduled tasks periodically

---

## Common Patterns

### Pattern 1: Talk to Claude

```
@Andy [message]
```
Message goes to registered group, triggers Claude, response sent back.

### Pattern 2: Schedule a Task

```
@Andy remind me every Monday at 9am to [task]
```
Claude schedules a cron task, which runs the prompt and sends results to the group.

### Pattern 3: Global vs. Group Memory

User in main channel:
```
@Andy remember I prefer dark mode     # Writes to global memory
```

Other groups can read this preference. Other groups write their own group-specific memory.

### Pattern 4: Manage Groups (Main Only)

```
@Andy add group "Family Chat"
@Andy list groups
@Andy remove group "Work Team"
```

Only main channel can register/unregister groups.

### Pattern 5: Extend with Skills

```
/add-gmail
/add-telegram
/debug
```

Claude Code loads the skill, follows instructions, transforms your installation.

---

## Development Commands Reference

```bash
# Development
npm run dev              # Run with hot reload (tsx)
npm run build            # Compile TypeScript
npm run typecheck        # Type check only
npm run format           # Auto-format code
npm test                 # Run tests
./container/build.sh     # Rebuild agent image

# Service management (macOS)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl list | grep nanoclaw

# Container debugging
container system status             # Apple Container
container run -it nanoclaw-agent:latest bash
docker info                         # Docker
docker run -it nanoclaw-agent:latest bash

# WhatsApp authentication
npm run auth             # Re-authenticate WhatsApp
```

---

## Environment Variables

### Authentication

```bash
# OAuth (Claude subscription)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...

# Or API Key (pay-per-use)
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Configuration

```bash
ASSISTANT_NAME=Bot                                # Trigger word (default: Andy)
CONTAINER_IMAGE=nanoclaw-agent:latest             # Container image name
CONTAINER_TIMEOUT=1800000                         # 30 min agent timeout (ms)
IDLE_TIMEOUT=1800000                              # 30 min container idle timeout (ms)
MAX_CONCURRENT_CONTAINERS=5                       # Max parallel agents
```

---

## Next Steps

1. **Run `/setup`** - Claude Code guides everything
2. **Add a group** - `@Andy add group "Family Chat"` from main channel
3. **Schedule a task** - `@Andy remind me every Monday at 9am to [task]`
4. **Extend with skills** - Run `/add-gmail`, `/add-telegram`, or `/debug`
5. **Customize** - Tell Claude what you want, or edit the code directly

---

## Additional Resources

- **README.md** - Philosophy, quick start, FAQ
- **SPEC.md** - Full specification (architecture, folder structure, message flow)
- **SECURITY.md** - Detailed security model and threat analysis
- **REQUIREMENTS.md** - Original design decisions and vision
- **CLAUDE.md** - Project context for Claude Code
- **CONTRIBUTING.md** - How to contribute skills
- **Discord** - [Community](https://discord.gg/VGWXrf8x)

---

**NanoClaw is built for customization. Fork it, run `/setup`, and make it yours.**
