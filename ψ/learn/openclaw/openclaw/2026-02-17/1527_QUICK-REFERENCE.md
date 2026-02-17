# OpenClaw Quick Reference

**Version**: 2026-02-17
**Source**: https://github.com/openclaw/openclaw
**Website**: https://openclaw.ai | **Docs**: https://docs.openclaw.ai

---

## What is OpenClaw?

**OpenClaw** is a self-hosted, personal AI assistant platform that runs on your own devices and connects to messaging apps you already use. It's a local-first system with a WebSocket control plane (Gateway) that orchestrates channels, tools, agents, and automation.

Key philosophy:
- **Personal, not cloud** — runs on your hardware
- **Multi-channel** — unified inbox across WhatsApp, Telegram, Slack, Discord, etc.
- **Always-on** — voice activation, cron jobs, webhooks
- **Extensible** — skills, plugins, and workspaces
- **Local-first** — the Gateway is the control plane (ws://127.0.0.1:18789)

Not suitable for: shared teams, multi-user deployments, or cloud-first workflows.

---

## Supported Channels

OpenClaw connects to **30+ messaging platforms**:

### Primary Channels (Most Common)
- **WhatsApp** — Baileys integration (stores credentials locally)
- **Telegram** — grammY bot framework (BOT_TOKEN auth)
- **Slack** — Bolt framework (BOT_TOKEN + APP_TOKEN)
- **Discord** — discord.js (BOT_TOKEN)
- **Signal** — signal-cli integration (requires local daemon)
- **Google Chat** — Chat API integration
- **iMessage** — BlueBubbles (recommended) or legacy imsg
- **Microsoft Teams** — Extension-based integration
- **Matrix** — Extension-based integration

### Extended Channels
- **Zalo** (Vietnam) — Extension + Zalo Personal variant
- **LINE** — Available via extension
- **Mattermost** — Chat API compatible
- **IRC** — Standard IRC protocol
- **Nextcloud Talk** — WebRTC/SIP
- **Nostr** — Decentralized messaging
- **Twitch** — Chat integration
- **Feishu** (Chinese Slack alternative) — Integration available

### Special Surfaces
- **WebChat** — Browser-based UI served from Gateway
- **BlueBubbles** — iMessage on Linux/macOS without Mac
- **Broadcast Groups** — Send to multiple channels
- **Group Messages** — Multi-user routing with mention gating

**DM Security Default**: New senders get a pairing code; no message processing until approved.

---

## Installation & Prerequisites

### Requirements
- **Node.js** ≥ 22.12.0 (critical for security patches)
- **macOS/Linux/Windows (WSL2)** — Windows via WSL2 strongly recommended
- **Package Manager**: npm, pnpm, or bun (bun not recommended for WhatsApp/Telegram)
- **~1 GB disk** for base install + workspace data

### Install (Recommended)
```bash
npm install -g openclaw@latest
# or: pnpm add -g openclaw@latest

openclaw onboard --install-daemon
```

The `onboard` wizard:
1. Sets up the Gateway daemon (launchd/systemd user service)
2. Configures credentials (Anthropic/OpenAI)
3. Guides channel setup
4. Installs skills

### Quick Start (Post-Install)
```bash
# Gateway runs as daemon; access via ws://127.0.0.1:18789
openclaw gateway --port 18789 --verbose

# Send a test message
openclaw message send --to +1234567890 --message "Hello from OpenClaw"

# Talk to the agent
openclaw agent --message "Your query" --thinking high

# Interactive setup
openclaw configure
openclaw doctor  # Diagnose config/security issues
```

### From Source (Development)
```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw

pnpm install
pnpm ui:build  # auto-installs UI deps on first run
pnpm build

pnpm openclaw onboard --install-daemon
pnpm gateway:watch  # auto-reload on TS changes
```

---

## Docker & Podman Setup

### Docker Compose
```yaml
services:
  openclaw-gateway:
    image: openclaw:local
    environment:
      HOME: /home/node
      OPENCLAW_GATEWAY_TOKEN: ${GATEWAY_TOKEN}
      CLAUDE_AI_SESSION_KEY: ${SESSION_KEY}
    volumes:
      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace
    ports:
      - "18789:18789"  # Gateway WebSocket
      - "18790:18790"  # Bridge (devices)
    restart: unless-stopped
    command: ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789"]
```

Environment variables:
- `OPENCLAW_CONFIG_DIR` — Host path to `~/.openclaw`
- `OPENCLAW_WORKSPACE_DIR` — Workspace directory
- `OPENCLAW_GATEWAY_TOKEN` — Auth token (if enabled)
- `CLAUDE_AI_SESSION_KEY` — Claude web session (if using web auth)

### Secure Docker Run
```bash
docker run --read-only --cap-drop=ALL \
  -v openclaw-data:/app/data \
  -p 18789:18789 \
  openclaw/openclaw:latest
```

### Podman (Rootless)
```bash
podman run --userns=keep-id -v openclaw-data:/data openclaw/openclaw:latest
```

**Notes**:
- Official image runs as non-root (`node` user)
- Use `--read-only` for additional filesystem protection
- Volume mounts map to `~/.openclaw` in container

---

## Configuration Approach

### Configuration Files (3 Primary Locations)

1. **`~/.openclaw/openclaw.json`** — Main config (model, agents, channels, tools)
2. **`~/.openclaw/credentials`** — Encrypted credentials (channel auth)
3. **`~/.openclaw/workspace/`** — Per-agent workspace (skills, prompts, state)
4. **`~/.openclaw/skills/`** — Managed/local skill overrides
5. **`<workspace>/skills/`** — Workspace-specific skills (highest precedence)
6. **`AGENTS.md`, `SOUL.md`, `TOOLS.md`** — Prompt injection files (workspace root)
7. **`plugins/`** — Plugin directory (if using plugins)
8. **`.openclaw/agents/`** — Agent skill catalog and workflows

### Minimal Config Example
```json5
{
  agent: {
    model: "anthropic/claude-opus-4-6",
  },
}
```

### Full Reference
See: `https://docs.openclaw.ai/gateway/configuration-reference`

### Config Management Tools
```bash
# Interactive wizard
openclaw configure
openclaw configure --section models --section channels

# CLI-based (non-interactive)
openclaw config get browser.executablePath
openclaw config set gateway.port 19001 --json
openclaw config set channels.whatsapp.groups '["*"]' --json

# Validate config
openclaw doctor
```

### Key Configuration Sections
- **`agent`** — Model selection (Anthropic/OpenAI/others)
- **`channels`** — WhatsApp, Telegram, Slack, Discord, etc.
- **`gateway`** — Port, bind address, auth mode, Tailscale
- **`tools`** — Browser, exec, filesystem, cron
- **`agents.defaults`** — Workspace, heartbeat, sandbox
- **`skills`** — Skill loading, gating, config

---

## Deployment Options

### Local Machine (macOS/Linux)
```bash
openclaw onboard --install-daemon
# Runs as launchd (macOS) or systemd (Linux) user service
```

Pros: Simple, full local access, instant startup
Cons: Device must stay on

### Fly.io
```yaml
# fly.toml (provided)
app = "openclaw"
primary_region = "iad"

[build]
dockerfile = "Dockerfile"

[env]
NODE_ENV = "production"
OPENCLAW_STATE_DIR = "/data"

[processes]
app = "node dist/index.js gateway --allow-unconfigured --port 3000 --bind lan"

[[vm]]
size = "shared-cpu-2x"
memory = "2048mb"

[mounts]
source = "openclaw_data"
destination = "/data"
```

Deploy:
```bash
fly launch
fly deploy
```

### Render (Platform as a Service)
```bash
# render.yaml available; configure environment variables
# Connect GitHub repo and deploy via Render UI
```

### Tailscale Serve/Funnel (Remote Access)
```bash
# Configure in openclaw.json
gateway:
  tailscale:
    mode: "serve"  # tailnet-only
    # or: "funnel" # public (requires password auth)

# Auto-configures Tailscale while Gateway stays loopback-bound
```

**Notes**:
- Gateway must bind to `loopback` when using Serve/Funnel
- Funnel requires `gateway.auth.mode: "password"`
- SSH tunnels are an alternative for remote access

### Linux (Remote) with macOS Node
- Gateway on Linux
- macOS/iOS/Android nodes via Bridge pairing
- Device actions execute locally on nodes

---

## Extension & Plugin System

### Skills Platform
**Skills** teach the agent how to use tools. Load order (highest to lowest precedence):
1. Workspace skills: `<workspace>/skills/<skill>/SKILL.md`
2. Local/managed skills: `~/.openclaw/skills/<skill>/SKILL.md`
3. Bundled skills: shipped with install
4. Extra skill dirs: `skills.load.extraDirs`

Example skill structure:
```markdown
---
name: my-skill
description: Do something cool
metadata: {
  "openclaw": {
    "requires": {
      "bins": ["python"],
      "env": ["MY_API_KEY"],
      "config": ["browser.enabled"]
    }
  }
}
---

# Instructions
- Use this skill to...
```

### ClawHub (Skills Registry)
```bash
# Browse public skills
# https://clawhub.com

# Install into workspace
clawhub install <skill-slug>

# Update all
clawhub update --all

# Sync changes
clawhub sync --all
```

### Plugins
Plugins ship their own:
- Skills (listed in `openclaw.plugin.json`)
- Tools
- CLI commands
- Channels (extensions)

Enable via config:
```json5
{
  plugins: {
    enabled: ["my-plugin"],
  }
}
```

---

## Skills System

### What is a Skill?
A skill is a directory with:
- **`SKILL.md`** — Metadata (YAML frontmatter) + instructions
- Optional custom executables or scripts

Skills teach the agent available actions; they live in one of three locations and follow AgentSkills format.

### Gating (Load-Time Filters)
```markdown
metadata: {
  "openclaw": {
    "requires": {
      "bins": ["gemini", "python"],
      "anyBins": ["chrome", "chromium"],
      "env": ["GEMINI_API_KEY"],
      "config": ["browser.enabled"]
    },
    "os": ["darwin", "linux"]  # Platform filter
  }
}
```

If requirements aren't met, the skill is skipped at load time.

### Per-Agent vs Shared
- **Shared skills** (`~/.openclaw/skills`) — visible to all agents
- **Per-agent skills** (`<workspace>/skills`) — agent-specific

### Bundled Skills (Examples)
- `browser` — Chrome/Chromium control
- `canvas` — A2UI visual workspace
- `nodes` — Device actions (camera, location, notifications)
- `cron` — Scheduled jobs
- `sessions_*` — Agent coordination tools
- `summarize`, `gemini`, `1password`, `apple-notes`, etc.

### Token Cost
- Base overhead: ~195 characters (when ≥1 skill present)
- Per skill: ~97 characters + metadata length
- Rough estimate: 24 tokens per skill + field data

---

## Security Model

### Default Behavior
- **Main session** (DMs): tools run on the host (full access)
- **Group/channel sessions**: run inside per-session Docker sandbox (restricted)

### Sandbox Defaults
- **Allowlist**: bash, process, read, write, edit, sessions_list/history/send/spawn
- **Denylist**: browser, canvas, nodes, cron, discord, gateway

### DM Pairing Security
```json5
{
  channels: {
    discord: {
      dmPolicy: "pairing"  // unknowns get pairing code; require approval
    },
    slack: {
      dmPolicy: "open"    // open to all (set allowFrom: ["*"])
    }
  }
}
```

### Hardening
```json5
{
  tools: {
    exec: {
      applyPatch: {
        workspaceOnly: true  // restrict apply_patch to workspace dir
      }
    },
    fs: {
      workspaceOnly: true  // restrict read/write/edit to workspace
    }
  },
  gateway: {
    auth: {
      mode: "password"  // require password on web UI
    }
  }
}
```

### Threat Model Guidance
- Treat inbound DMs as **untrusted input**
- Don't expose Gateway to public internet (loopback only or Tailscale)
- Keep Node.js ≥22.12.0 for security patches
- Run `openclaw doctor` to surface risky configurations
- See: `https://docs.openclaw.ai/gateway/security`

---

## OpenClaw vs NanoClaw (Minimalist Fork)

| Aspect | OpenClaw | NanoClaw |
|--------|----------|----------|
| **Philosophy** | Full-featured personal AI assistant | Minimalist, lean codebase |
| **Channels** | 30+ (WhatsApp, Telegram, Slack, Discord, Signal, etc.) | Core channels only |
| **Apps** | macOS, iOS, Android nodes | Minimal or none |
| **Skills** | Full skills platform, ClawHub registry | Basic tool integration |
| **Automation** | Cron, webhooks, Gmail Pub/Sub, heartbeat | Limited |
| **Tools** | Browser, Canvas, nodes, sessions, full API | Core only |
| **Gateway Features** | Full control UI, Tailscale, remote nodes | Basic |
| **Complexity** | Higher; more moving parts | Lower; easier to understand/modify |
| **Use Case** | Power users, multi-device, always-on | Developers wanting lean alternative |
| **Repo** | github.com/openclaw/openclaw | github.com/openclaw/nanoclaw |

**Bottom line**: OpenClaw = batteries included; NanoClaw = DIY foundation.

---

## Key Files & Directories

```
openclaw/
├── src/
│   ├── agents/              # Agent runtime + skills loader
│   ├── channels/            # WhatsApp, Telegram, Slack, Discord, etc.
│   ├── commands/            # CLI commands (agent, gateway, config, etc.)
│   ├── config/              # Config schema + loaders
│   ├── gateway/             # Control plane (WebSocket, sessions, presence)
│   ├── tools/               # Built-in tools (browser, canvas, nodes, etc.)
│   ├── cron/                # Cron jobs + heartbeat
│   └── cli/                 # CLI entry point
├── skills/                  # Bundled skills (~50+ pre-built)
├── apps/
│   ├── macos/               # macOS menu bar app
│   ├── ios/                 # iOS node app
│   └── android/             # Android node app
├── docs/                    # Full documentation (channels, tools, concepts)
├── Dockerfile               # Docker image
├── fly.toml                 # Fly.io config
├── docker-compose.yml       # Docker Compose example
├── package.json             # Dependencies (Node 22+, pnpm)
└── tsconfig.json            # TypeScript config (legacy decorators)

~/.openclaw/
├── openclaw.json            # Main config
├── credentials              # Encrypted channel creds
├── workspace/               # Per-agent workspace
│   ├── skills/              # Workspace skills (highest precedence)
│   ├── AGENTS.md            # Agent prompt injection
│   ├── SOUL.md              # System prompt override
│   └── TOOLS.md             # Tool descriptions
├── skills/                  # Local/managed skill overrides
└── gateway.sock             # Unix socket (daemon)
```

---

## Gateway & WebSocket Protocol

### Gateway Basics
```bash
openclaw gateway --port 18789 --bind loopback
# ws://127.0.0.1:18789 — Control plane for all clients
```

### WebSocket Clients
- **CLI** (`openclaw agent ...`)
- **macOS app** (menu bar control + Voice Wake)
- **iOS/Android nodes** (pairing, canvas, camera)
- **WebChat UI** (browser-based chat)
- **IDEs/tools** (ACP bridge for editor integration)

### Gateway Methods
- `sessions.list` — discover active sessions
- `sessions_history` — fetch session transcript
- `sessions.send` — message another agent
- `gateway.config` — read current config
- `node.list` / `node.describe` — enumerate connected nodes
- `node.invoke` — run command on device node

### ACP (Agent Client Protocol)
OpenClaw exposes an **ACP bridge** over stdio for IDE integration:
```bash
openclaw acp --url wss://gateway:18789 --token <token> --session agent:main:main
```

Used by: Zed editor (custom agent config), potentially others.

---

## Development Channels

OpenClaw has three update channels:

1. **`stable`** (default) — Tagged releases (`vYYYY.M.D`)
   - npm dist-tag: `latest`
   - Most reliable

2. **`beta`** — Pre-release (`vYYYY.M.D-beta.N`)
   - npm dist-tag: `beta`
   - macOS app may be missing

3. **`dev`** — Moving head of `main`
   - npm dist-tag: `dev`
   - Bleeding edge

Switch channels:
```bash
openclaw update --channel beta
openclaw update --channel stable
```

---

## Common Use Cases

### Personal AI on WhatsApp
```bash
openclaw onboard  # pairs WhatsApp
# Then DM the assistant from any contact (must approve pairing first)
```

### Group Chat Bot (Discord)
```json5
{
  channels: {
    discord: {
      token: "BOT_TOKEN",
      allowFrom: ["channel-id-1", "channel-id-2"]
    }
  }
}
```

### Always-On Voice Assistant (macOS)
1. Install macOS app (`apps/macos`)
2. Enable Voice Wake (`VoiceWake` skill)
3. Use keyboard shortcut to trigger

### Scheduled Automation (Cron)
```bash
openclaw cron new "Every day at 9am" --command "summarize yesterday"
```

### Multi-Device Workflow
- Gateway on Linux
- macOS node for `system.run` + screen recording
- iOS node for canvas + camera
- Bridge pairing (local Bonjour)

### Team Coordination (Multi-Agent)
```json5
{
  agents: {
    list: [
      { id: "main", workspace: "~/.openclaw/workspace" },
      { id: "design", workspace: "~/.openclaw/workspace-design" },
      { id: "qa", workspace: "~/.openclaw/workspace-qa" }
    ]
  }
}
```

Each agent can message others via `sessions_send`.

---

## Useful Commands

```bash
# Onboarding & Setup
openclaw onboard --install-daemon
openclaw configure
openclaw doctor

# Gateway & Runtime
openclaw gateway --port 18789 --verbose
openclaw health

# Agent Interaction
openclaw agent --message "Your query" --thinking high
openclaw message send --to <contact> --message "Hello"

# Channel Management
openclaw channels login
openclaw channels list

# Session Management
openclaw sessions list
openclaw sessions reset <session-key>

# Configuration
openclaw config get <path>
openclaw config set <path> <value>
openclaw config unset <path>

# Skills
openclaw skills list

# Troubleshooting
openclaw doctor
openclaw logs tail -f
openclaw reset

# Update
openclaw update --channel stable|beta|dev
```

---

## Resources

- **Homepage**: https://openclaw.ai
- **Docs**: https://docs.openclaw.ai
- **GitHub**: https://github.com/openclaw/openclaw
- **Discord**: https://discord.gg/clawd
- **Skills Registry**: https://clawhub.com
- **Trust & Security**: https://trust.openclaw.ai
- **Contributing**: https://github.com/openclaw/openclaw/blob/main/CONTRIBUTING.md

---

## Performance Notes

- **Gateway startup**: ~5 seconds
- **Agent turn time**: 1-30 seconds (depends on model + tools)
- **Skill load time**: ~100ms per skill + network
- **Memory usage**: ~500MB base + tool overhead
- **Token cost**: Varies by model; ~4 chars per token (OpenAI-style)

---

## Development Notes

### Build & Runtime
```bash
pnpm install
pnpm ui:build  # Build frontend UI
pnpm build     # Compile TypeScript
pnpm test      # Run test suite
```

### Debugging
- `openclaw doctor` — Comprehensive diagnostics
- `openclaw logs` — View gateway logs
- `--verbose` flag on any command for more output
- Browser console (WebChat) for UI issues

### Contributing
- PRs welcome (bugs, small fixes)
- Discuss features in GitHub Discussions first
- AI-assisted code OK; mark in PR title
- Main focus: stability, UX, skills, performance

---

**Last Updated**: 2026-02-17
**OpenClaw Version**: Latest
**Node Requirement**: 22.12.0+
