# Moltbot Quick Reference Guide

## What It Does

Moltbot (formerly Clawdbot) is a personal AI assistant platform you run on your own devices that connects to all your messaging channels. It provides a unified inbox across WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, BlueBubbles, Microsoft Teams, Matrix, Zalo, and WebChat. The Gateway is the control plane that powers multi-channel routing, multi-agent sessions, tools integration, and automation—with optional companion apps for macOS, iOS, and Android for voice control, live canvas interactions, and always-on access.

## Installation

### Recommended (via npm/pnpm)

```bash
# Install globally
npm install -g moltbot@latest
# or with pnpm
pnpm add -g moltbot@latest

# Run the onboarding wizard (installs daemon for auto-start)
moltbot onboard --install-daemon
```

**Requirements:**
- Node.js ≥ 22.12.0
- Works with npm, pnpm, or bun
- macOS, Linux, Windows (WSL2 strongly recommended)

### From Source (Development)

```bash
git clone https://github.com/moltbot/moltbot.git
cd moltbot

pnpm install
pnpm ui:build      # auto-installs UI deps on first run
pnpm build

pnpm moltbot onboard --install-daemon

# Dev loop (auto-reload on TypeScript changes)
pnpm gateway:watch
```

## Key Features

- **Multi-Channel Inbox** — Unified interface across 13+ messaging platforms
- **Local-First Gateway** — WebSocket control plane (ws://127.0.0.1:18789) with sessions, channels, tools, and events
- **Multi-Agent Routing** — Route channels/accounts to isolated agents with per-agent workspaces and sessions
- **Voice Control** — Always-on Voice Wake + Push-to-Talk overlay (macOS/iOS/Android with ElevenLabs)
- **Live Canvas** — Agent-driven visual workspace with A2UI framework for rich interactions
- **First-Class Tools** — Browser automation, canvas control, cron jobs, node commands (camera, screen record), webhooks, Gmail Pub/Sub
- **Companion Apps** — macOS menu bar app, iOS node, Android node with Canvas, camera, and location features
- **Skills Platform** — Bundled, managed, and custom workspace skills with auto-install gating
- **Multi-Model Support** — Anthropic Claude (Pro/Max), OpenAI ChatGPT/Codex, model failover + rotation
- **Security by Default** — DM pairing policy, per-session Docker sandboxing for group/channel isolation, TCC permission management
- **Session Management** — Context compaction, model/thinking level per-session, presence tracking, usage telemetry

## Usage Patterns

### Basic Commands (CLI)

```bash
# Start the Gateway
moltbot gateway --port 18789 --verbose

# Run onboarding wizard (auth, pairing, channels, skills)
moltbot onboard

# Send a message
moltbot message send --to +1234567890 --message "Hello"

# Talk to the assistant
moltbot agent --message "Your query" --thinking high

# Check config/health
moltbot doctor

# Manage pairing (DM security)
moltbot pairing approve <channel> <code>

# List nodes (device actions)
moltbot nodes list
```

### In-Chat Commands (WhatsApp/Telegram/Slack/Discord/Teams/WebChat)

Send these in any connected channel:

```
/status              # Show compact session status (model, tokens, cost)
/new or /reset       # Reset session context
/compact             # Summarize and compress session history
/think <level>       # Set thinking level: off|minimal|low|medium|high|xhigh
/verbose on|off      # Toggle verbose output mode
/usage off|tokens|full  # Toggle usage footer (cost/token counts)
/restart             # Restart the gateway (owner-only in groups)
/activation mention|always  # Toggle group mention requirement (groups only)
```

### Gateway WebSocket (Advanced)

Clients connect to `ws://127.0.0.1:18789` for:
- Real-time message routing
- Session state management
- Tool execution (browser, canvas, nodes)
- Presence and typing indicators
- Event streaming

## Configuration

### Minimal Setup (~/.clawdbot/clawdbot.json)

```json5
{
  agent: {
    model: "anthropic/claude-opus-4-5"
  }
}
```

### Full Configuration Reference

See [Full Configuration](https://docs.molt.bot/gateway/configuration) for complete key reference.

### Environment Variables

Commonly used env vars (can also be set in config file):

```bash
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABCDEF

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# Discord
DISCORD_BOT_TOKEN=1234abcd...

# Twilio WhatsApp (from .env.example)
TWILIO_ACCOUNT_SID=ACxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_FROM=whatsapp:+1734336xxxx
```

### Channel Configuration Examples

#### WhatsApp (Baileys)
```bash
moltbot channels login  # Link device, stores creds in ~/.clawdbot/credentials
# Config: channels.whatsapp.allowFrom (allowlist), channels.whatsapp.groups
```

#### Telegram
```json5
{
  channels: {
    telegram: {
      botToken: "123456:ABCDEF"
      // Optional: groups, allowFrom, webhookUrl
    }
  }
}
```

#### Slack
```json5
{
  channels: {
    slack: {
      botToken: "xoxb-...",
      appToken: "xapp-..."
    }
  }
}
```

#### Discord
```json5
{
  channels: {
    discord: {
      token: "1234abcd"
      // Optional: dm.allowFrom, guilds, mediaMaxMb
    }
  }
}
```

#### Browser Control
```json5
{
  browser: {
    enabled: true,
    color: "#FF4500"  // Highlight color for agent actions
  }
}
```

### Security & DM Policy

Default DM behavior:
- **pairing** — Unknown senders get a pairing code; approve with `moltbot pairing approve <channel> <code>`
- **open** — All DMs allowed (requires `"*"` in allowlist; not recommended)

Sandboxing for group/channel isolation:
```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main"  // Run group/channel sessions in Docker
      }
    }
  }
}
```

### Workspace & Skills

- **Workspace root:** `~/clawd` (configurable via `agents.defaults.workspace`)
- **Injected files:** `AGENTS.md`, `SOUL.md`, `TOOLS.md` (customize agent behavior)
- **Skills location:** `~/clawd/skills/<skill>/SKILL.md`
- **Skills registry:** [ClawdHub](https://ClawdHub.com) for auto-discovery and managed skills

---

**For deeper reference:** [Full Documentation](https://docs.molt.bot)
**Getting Started:** [Onboarding Guide](https://docs.molt.bot/start/getting-started)
**Architecture:** [Gateway & Protocol](https://docs.molt.bot/concepts/architecture)
**Security:** [Security Guide](https://docs.molt.bot/gateway/security)
