# OpenClaw Architecture Overview

**Date**: 2026-02-17
**Project**: OpenClaw - Multi-channel AI Gateway
**Repository**: https://github.com/openclaw/openclaw
**Version**: 2026.2.16

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Context](#project-context)
3. [High-Level Architecture](#high-level-architecture)
4. [Monorepo Structure](#monorepo-structure)
5. [Entry Points](#entry-points)
6. [Core Systems](#core-systems)
7. [Channel/Provider System](#channelprovider-system)
8. [Plugin/Extension System](#pluginextension-system)
9. [Gateway Architecture](#gateway-architecture)
10. [Configuration System](#configuration-system)
11. [Agent/AI System](#agentai-system)
12. [Key Dependencies](#key-dependencies)
13. [Security & Sandboxing](#security--sandboxing)
14. [Development Workflows](#development-workflows)

---

## Executive Summary

**OpenClaw** is a personal AI assistant platform that runs locally on your own devices, allowing multi-channel messaging integration (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, etc.) through a unified gateway architecture.

**Core Value Proposition**:
- Single-user, privacy-focused AI assistant
- Multi-channel messaging support (9 core channels + 30+ extension channels)
- Extensible plugin system for custom integrations
- Local-first control plane (Gateway) managing distributed agent runs
- Supports macOS, iOS, Android, and Linux
- AI model flexibility (Claude/OpenAI/Ollama)

**Architecture Style**: Monorepo with modular packages, pnpm workspaces, TypeScript (ESM), extensible via plugins.

---

## Project Context

### What OpenClaw Does

OpenClaw is not a single application but a **control plane + distributed agent system**:

1. **Gateway** (control plane): Central hub managing configuration, channels, plugins, cron jobs, authentication
2. **Agents** (distributed): Pi-embedded agent instances that run AI conversations (supports multi-agent setups)
3. **Channels** (providers): WhatsApp Web, Telegram Bot API, Discord Bot API, Signal, Slack (Socket Mode), iMessage, Google Chat, IRC, and 30+ extension channels
4. **Plugins/Extensions**: Extensible system for adding channels, auth providers, memory backends, diagnostics, and domain-specific skills

### User Personas

- **Developer**: Running on macOS/Linux, developing custom integrations, extending OpenClaw
- **End User**: Setting up via onboarding wizard, running daemon on personal device, using via messaging apps
- **Enterprise/Team**: Multi-agent setup, custom channels, advanced config

### Key Constraints

- **Node.js 22+** required (security requirements: CVE-2025-59466, CVE-2026-21636)
- **Single-user, local-first**: Not designed for multi-user public internet exposure
- **Privacy-focused**: All data stays on user's device
- **Extensibility**: Plugins must be carefully sandboxed

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENCLAW SYSTEM                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              GATEWAY (Control Plane)                 │   │
│  │  - HTTP/WebSocket Server                             │   │
│  │  - Channel Management (registry + lifecycle)         │   │
│  │  - Plugin System (discovery + loading)               │   │
│  │  - Config Management (YAML-based)                    │   │
│  │  - Auth + Rate Limiting                              │   │
│  │  - Cron/Scheduling                                   │   │
│  │  - Health Monitoring                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↑ ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         CHANNEL PLUGINS (Messaging)                  │   │
│  │  ┌────────────┬─────────┬──────────┬──────────┐      │   │
│  │  │ Telegram   │ Discord │ WhatsApp │ Slack    │ ...  │   │
│  │  │ (Bot API)  │ (Bot)   │ (Web)    │ (Socket) │      │   │
│  │  └────────────┴─────────┴──────────┴──────────┘      │   │
│  │  ┌────────────┬─────────┬──────────┬──────────┐      │   │
│  │  │ Signal     │ IRC     │ iMessage │ Matrix   │ ...  │   │
│  │  │ (signal    │ (Server │ (Bridge) │ (Synapse)│      │   │
│  │  │  -cli)     │ + Nick) │          │          │      │   │
│  │  └────────────┴─────────┴──────────┴──────────┘      │   │
│  │  Extensions: Zalo, Zalo Personal, BlueBubbles, Feishu│   │
│  │              Google Chat, LINE, Microsoft Teams, etc. │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↑ ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │      AGENT RUNTIME (Pi-Embedded Agent SDK)           │   │
│  │  - Multi-agent runs (concurrent or serial)           │   │
│  │  - Tool execution sandbox                            │   │
│  │  - Memory system (vector DB + session store)         │   │
│  │  - Tool discovery + dynamic loading                  │   │
│  │  - Hooks system (lifecycle events)                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↑ ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        PLUGIN ECOSYSTEM (Extension Layer)            │   │
│  │  ┌─────────────┬────────────┬────────────┐           │   │
│  │  │ Auth        │ Memory     │ Diagnostics│           │   │
│  │  │ Providers   │ Backends   │ (OpenTel)  │           │   │
│  │  └─────────────┴────────────┴────────────┘           │   │
│  │  ┌─────────────┬────────────┬────────────┐           │   │
│  │  │ Domain      │ Voice      │ Custom     │           │   │
│  │  │ Skills      │ Call       │ Channels   │           │   │
│  │  └─────────────┴────────────┴────────────┘           │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↑ ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         PERSISTENT STATE & STORAGE                   │   │
│  │  - ~/.openclaw/config.json5 (main config)            │   │
│  │  - ~/.openclaw/sessions/ (agent sessions)            │   │
│  │  - ~/.openclaw/credentials/ (auth tokens)            │   │
│  │  - Optional: LanceDB (vector embeddings)             │   │
│  │  - Optional: SQLite (session history)                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

### Layout (pnpm Workspaces)

```
openclaw/
├── package.json                 # Root workspace definition
├── pnpm-workspace.yaml          # Workspace config (. + ui, packages/*, extensions/*)
├── openclaw.mjs                 # CLI entry point (bin executable)
├── tsconfig.json                # Base TypeScript config
│
├── src/                         # Main source (369 modules; THE CORE)
│   ├── index.ts                 # Library export entry point
│   ├── entry.ts                 # CLI respawning & profile setup
│   ├── cli/                     # CLI commands & wiring (~100+ modules)
│   │   ├── program.js           # Commander.js program builder
│   │   ├── run-main.js          # CLI entry dispatcher
│   │   ├── commands/            # Individual CLI command implementations
│   │   └── deps.js              # Dependency injection setup
│   │
│   ├── gateway/                 # Gateway server (control plane; ~160 modules)
│   │   ├── server.impl.ts       # Core gateway server implementation
│   │   ├── server-channels.ts   # Channel management
│   │   ├── server-chat.ts       # Chat routing & handling
│   │   ├── server-cron.ts       # Cron/scheduling
│   │   ├── server-http.ts       # HTTP server setup
│   │   ├── server-ws-runtime.ts # WebSocket handling
│   │   ├── control-ui.ts        # Control UI (web dashboard)
│   │   ├── auth.ts              # Authentication & rate limiting
│   │   ├── server-methods/      # RPC method implementations
│   │   ├── protocol/            # Gateway protocol definitions
│   │   └── server/              # Supporting server modules
│   │
│   ├── agents/                  # Agent runtime (~375 files)
│   │   ├── agent-scope.ts       # Agent workspace & identity resolution
│   │   ├── auth-profiles/       # Model auth (Claude, OpenAI, etc.)
│   │   ├── bash-tools.ts        # Tool execution sandbox (bash)
│   │   ├── apply-patch.ts       # Code patch application
│   │   ├── pi-embedded-runner/  # Pi SDK integration
│   │   ├── subagent-registry.ts # Multi-agent management
│   │   ├── skills/              # Built-in skills discovery
│   │   └── tools/               # Tool definitions & schemas
│   │
│   ├── channels/                # Channel registry & shared logic (~32 modules)
│   │   ├── registry.ts          # Channel docking & metadata
│   │   ├── allowlists/          # Channel allowlist management
│   │   ├── dock.ts              # Channel dock/docking UI
│   │   ├── plugins/             # Channel plugin interface
│   │   └── plugins/             # Built-in plugin map
│   │
│   ├── plugins/                 # Plugin system (~52 modules)
│   │   ├── loader.ts            # Plugin discovery & loading
│   │   ├── manifest.ts          # Plugin manifest parser
│   │   ├── registry.ts          # Plugin registry
│   │   ├── hooks.ts             # Plugin hooks system
│   │   ├── install.ts           # Plugin installation
│   │   ├── commands.ts          # Plugin CLI commands
│   │   └── http-registry.ts     # HTTP route registration
│   │
│   ├── config/                  # Config system (~144 modules)
│   │   ├── config.ts            # Main config loader
│   │   ├── zod-schema.ts        # Config validation schema
│   │   ├── legacy-migrate.ts    # Legacy config migration
│   │   ├── io.ts                # Config I/O (read/write)
│   │   └── validation.ts        # Validation with plugins
│   │
│   ├── commands/                # CLI commands (~200+ modules)
│   │   ├── agent/               # agent subcommand
│   │   ├── gateway/             # gateway subcommand
│   │   ├── channels/            # channels subcommand
│   │   ├── config/              # config subcommand
│   │   ├── skills/              # skills subcommand
│   │   ├── plugins/             # plugins subcommand
│   │   ├── message/             # message subcommand
│   │   ├── tui/                 # tui subcommand (terminal UI)
│   │   └── onboard/             # onboard subcommand (wizard)
│   │
│   ├── media/                   # Media processing (~28 modules)
│   │   ├── file-processor.ts    # File I/O
│   │   ├── image-processor.ts   # Image processing (sharp)
│   │   ├── pdf-processor.ts     # PDF reading (pdfjs)
│   │   └── etc.
│   │
│   ├── browser/                 # Headless browser (~89 modules)
│   │   ├── browser.ts           # Playwright-based browser control
│   │   └── automation tasks
│   │
│   ├── logging/                 # Structured logging (~22 modules)
│   │   ├── subsystem.ts         # Per-subsystem logger
│   │   └── diagnostic.ts        # Diagnostic event logging
│   │
│   ├── infra/                   # Infrastructure & utilities (~191 modules)
│   │   ├── env.ts               # Environment setup
│   │   ├── dotenv.ts            # .env file loading
│   │   ├── runtime-guard.ts     # Node.js version checking
│   │   ├── ports.ts             # Port availability checks
│   │   ├── binaries.ts          # Binary/executable management
│   │   ├── control-ui-assets.ts # Control UI bundling
│   │   ├── device-pairing.ts    # Device pairing protocol
│   │   ├── heartbeat-runner.ts  # Periodic health checks
│   │   ├── agent-events.ts      # Global agent event system
│   │   └── etc.
│   │
│   ├── memory/                  # Memory system (~80 modules)
│   │   ├── memory-provider.ts   # Memory interface
│   │   ├── vector-store.ts      # Vector embeddings storage
│   │   └── session management
│   │
│   ├── hooks/                   # Hook system (~28 modules)
│   │   └── Lifecycle event hooks for plugins
│   │
│   ├── security/                # Security & auth (~23 modules)
│   │   ├── auth.ts              # Auth mechanisms
│   │   └── Audit & approval systems
│   │
│   ├── sessions/                # Session management (~10 modules)
│   │   └── Agent & user session tracking
│   │
│   ├── routing/                 # Message routing (~6 modules)
│   │   └── Channel message routing logic
│   │
│   ├── wizard/                  # Onboarding wizard
│   │   └── Interactive setup flows
│   │
│   ├── tui/                     # Terminal UI (~29 modules)
│   │   └── Rich CLI dashboard
│   │
│   ├── providers/               # Auth providers (~11 modules)
│   │   ├── anthropic
│   │   └── openai, ollama, etc.
│   │
│   ├── types/                   # Type definitions
│   │   └── Global type stubs (external APIs)
│   │
│   ├── shared/                  # Shared utilities (~20 modules)
│   │   └── Common code used across modules
│   │
│   ├── utils.ts                 # Core utilities (1000+ LOC)
│   ├── logger.ts                # Main logger setup
│   ├── index.ts                 # Library export
│   └── etc.
│
├── packages/                    # NPM workspace packages (2 packages)
│   ├── clawdbot/                # Example bot framework
│   │   └── src/
│   │
│   └── moltbot/                 # Another bot example
│       └── src/
│
├── extensions/                  # Plugin workspace (~41 extensions)
│   ├── bluebubbles/             # BlueBubbles channel plugin
│   ├── copilot-proxy/           # MS Copilot proxy
│   ├── device-pair/             # Device pairing extension
│   ├── diagnostics-otel/        # OpenTelemetry diagnostics
│   ├── discord/                 # Discord channel (extension version)
│   ├── feishu/                  # Feishu/Lark channel
│   ├── google-gemini-cli-auth/  # Gemini CLI auth provider
│   ├── googlechat/              # Google Chat channel
│   ├── imessage/                # iMessage channel (extension)
│   ├── irc/                     # IRC channel
│   ├── line/                    # LINE messaging channel
│   ├── llm-task/                # LLM task tool plugin
│   ├── lobster/                 # Lobster integration
│   ├── matrix/                  # Matrix/Synapse channel
│   ├── mattermost/              # Mattermost channel
│   ├── memory-core/             # Memory system core plugin
│   ├── memory-lancedb/          # LanceDB vector memory
│   ├── msteams/                 # Microsoft Teams channel
│   ├── nextcloud-talk/          # Nextcloud Talk channel
│   ├── nostr/                   # Nostr protocol channel
│   ├── open-prose/              # Open Prose integration
│   ├── qwen-portal-auth/        # Alibaba Qwen auth
│   ├── shared/                  # Shared extension utilities
│   ├── signal/                  # Signal channel (extension)
│   ├── slack/                   # Slack channel (extension)
│   ├── talk-voice/              # Voice calling plugin
│   ├── telegram/                # Telegram channel (extension)
│   ├── thread-ownership/        # Thread ownership system
│   ├── tlon/                    # Urbit Tlon integration
│   ├── twitch/                  # Twitch channel
│   ├── voice-call/              # Advanced voice call plugin
│   ├── whatsapp/                # WhatsApp channel (extension)
│   ├── zalo/                    # Zalo channel
│   └── zalouser/                # Zalo personal messaging
│
├── apps/                        # Native mobile/desktop apps
│   ├── macos/                   # macOS app (Swift/SwiftUI)
│   │   ├── Sources/
│   │   ├── OpenClaw.xcodeproj/
│   │   └── Tests/
│   │
│   ├── ios/                     # iOS app (Swift/SwiftUI)
│   │   └── OpenClawKit SDK
│   │
│   ├── android/                 # Android app (Kotlin/Compose)
│   │   └── Gradle project
│   │
│   └── shared/                  # Shared iOS/macOS code (Kit)
│       └── OpenClawKit library
│
├── ui/                          # Web UI (separate pnpm package)
│   ├── package.json             # React/TypeScript frontend
│   ├── src/
│   │   ├── pages/               # Control UI pages
│   │   ├── components/          # React components
│   │   └── etc.
│   └── dist/                    # Built frontend (served by gateway)
│
├── Swabble/                     # Swabble IDE/plugin editor?
│   └── Xcode project structure
│
├── scripts/                     # Build & dev scripts (~83 files)
│   ├── run-node.mjs             # Dev server runner
│   ├── build-docs-list.mjs      # Documentation generator
│   ├── test-parallel.mjs        # Test runner
│   ├── ui.js                    # UI build/dev helper
│   ├── e2e/                     # End-to-end test scripts
│   └── etc.
│
├── test/                        # Integration tests (~13 modules)
│   ├── e2e/                     # E2E test suites
│   ├── fixtures/                # Test fixtures
│   └── etc.
│
├── docs/                        # Documentation (~44 folders)
│   ├── channels/                # Channel-specific docs
│   ├── concepts/                # Core concept docs
│   ├── configuration/           # Config reference
│   ├── gateway/                 # Gateway docs
│   ├── agents/                  # Agent system docs
│   ├── platforms/               # Platform-specific (mac, ios, android)
│   ├── reference/               # API reference
│   ├── start/                   # Getting started guides
│   └── .i18n/                   # i18n (Chinese translation)
│
├── skills/                      # Built-in skills (~54 modules)
│   ├── browser/                 # Web automation skills
│   ├── code-browser/            # Code exploration skills
│   ├── email/                   # Email integration
│   ├── filesystem/              # File system access
│   ├── github/                  # GitHub API integration
│   ├── image-gen/               # Image generation
│   ├── linear/                  # Linear issue tracking
│   ├── math/                    # Math & calculation
│   ├── memory/                  # Memory management
│   ├── os-utils/                # OS utilities
│   ├── search/                  # Web search
│   ├── shell/                   # Shell command execution
│   └── etc.
│
├── .agents/                     # Agent configuration (~4 files)
│   └── Agent setup for this repo
│
├── .github/                     # GitHub workflows & config
│   ├── workflows/               # CI/CD (test, build, release)
│   ├── ISSUE_TEMPLATE/          # Issue templates
│   └── labeler.yml              # Auto-labeling rules
│
├── .vscode/                     # VS Code workspace config
├── git-hooks/                   # Git hooks
├── patches/                     # npm patch-package patches
│
├── README.md                    # Main README
├── AGENTS.md                    # Agent/developer guidelines
├── SECURITY.md                  # Security policy
├── LICENSE                      # MIT license
├── .env.example                 # Environment template
└── .gitignore, tsconfig.json, etc.
```

### Workspace Packages (pnpm)

```yaml
packages:
  - .                    # Root (main openclaw package)
  - ui                   # Web UI (React frontend)
  - packages/*           # NPM packages (clawdbot, moltbot)
  - extensions/*         # 41 plugin extensions
```

---

## Entry Points

### 1. CLI Entry (`openclaw.mjs` -> `src/entry.ts`)

**Flow**:
```
openclaw.mjs (bin executable)
  ↓
src/entry.ts (respawn guard + profile setup)
  ├─ Ensures experimental warnings suppressed
  ├─ Applies CLI profile environment
  ├─ Normalizes Windows argv
  ↓
src/index.ts / src/cli/run-main.js
  ├─ Loads .env
  ├─ Normalizes environment
  ├─ Installs error handlers
  ↓
src/cli/program.js (Commander.js)
  ├─ agent <args>
  ├─ gateway <args>
  ├─ channels <args>
  ├─ plugins <args>
  ├─ config <args>
  ├─ message <args>
  ├─ tui (TUI dashboard)
  ├─ onboard (wizard)
  └─ ... (30+ commands)
```

**Key Commands**:
- `openclaw gateway --port 18789 --verbose` - Start gateway
- `openclaw agent --message "hello" --thinking high` - Run agent
- `openclaw onboard --install-daemon` - Interactive setup
- `openclaw channels status --probe` - Check channel health
- `openclaw config set gateway.bind=loopback` - Configure

### 2. Gateway Server (`src/gateway/server.impl.ts`)

**Initialization Flow**:
```
gateway.run() (CLI command)
  ↓
Gateway constructor
  ├─ Load config (YAML)
  ├─ Initialize plugin system
  ├─ Setup channel manager
  ├─ Setup agent runner
  ├─ Initialize memory system
  ├─ Setup cron scheduler
  ↓
HTTP/WebSocket server (Express + ws)
  ├─ /api/* endpoints (RPC methods)
  ├─ /control-ui/* (web dashboard)
  ├─ /__openclaw__/canvas/* (canvas host)
  ├─ Health check endpoints
  └─ WebSocket for real-time events
  ↓
Channel lifecycle
  ├─ Load channel plugins
  ├─ Connect each enabled channel
  ├─ Monitor health
  └─ Route messages
  ↓
Agent runtime
  ├─ Initialize Pi-embedded agent
  ├─ Load auth profiles
  ├─ Setup tool sandbox
  └─ Listen for chat events
```

### 3. Library/Plugin SDK (`src/plugin-sdk/index.ts`)

Exports for plugin developers:
- `createPlugin()` - Plugin factory
- `ChannelPlugin`, `AuthPlugin`, `MemoryPlugin` - Plugin type interfaces
- `Logger`, `Config`, `Storage` - Service APIs
- Hooks registration
- Tool definitions

---

## Core Systems

### A. Channel/Messaging System

**Structure** (`src/channels/` + `extensions/*/`):

```
Channel Registry (src/channels/registry.ts)
├─ CHAT_CHANNEL_ORDER (core channels order)
├─ CHANNEL_META (metadata: labels, docs, icons)
└─ Channel plugin resolution

Core Channels (built-in via plugins):
├─ telegram         → Bot API (@BotFather)
├─ whatsapp         → Web QR linking
├─ discord          → Bot API token
├─ irc              → Server + Nick
├─ googlechat       → Webhook HTTP
├─ slack            → Socket Mode
├─ signal           → signal-cli linked device
└─ imessage         → BlueBubbles bridge

Extension Channels (plugins):
├─ matrix           → Synapse protocol
├─ zalo             → Zalo messaging
├─ zalouser         → Zalo personal
├─ msteams          → Microsoft Teams
├─ line             → LINE Bot
├─ nextcloud-talk   → Nextcloud Talk
├─ twitch           → Twitch chat
├─ nostr            → Nostr protocol
└─ +30 more

Channel Plugins Implement:
├─ connect()        → Initialize channel
├─ send(msg)        → Send message
├─ disconnect()     → Cleanup
├─ setHandlers()    → Register message handlers
└─ getCapabilities() → Features (media, reactions, etc.)

Message Flow:
incoming message (channel)
  → routing engine
  → allowlist/pairing check
  → dispatch to agent
  → agent processes
  → response routed back to channel
```

**Message Handler System** (`src/channels/dock.ts`):

- Per-channel allowlists (who can message)
- Command gating (which commands per user)
- Mention gating (require @ mention)
- DM policy (direct message restrictions)
- Pairing system (link channel accounts to agent identities)
- Session routing (group vs. DM routing)

**Key Files**:
- `src/channels/registry.ts` - Channel docking & metadata
- `src/channels/plugins/` - Plugin interface
- `src/gateway/server-channels.ts` - Channel lifecycle mgmt
- `extensions/*/src/` - Individual channel implementations

### B. Plugin System

**Architecture** (`src/plugins/`):

```
Plugin Discovery Phase
├─ Scan extensions/ directory
├─ Load package.json manifests
├─ Validate plugin.openclaw.* config
└─ Determine enabled plugins (via config)

Plugin Loading Phase
├─ jiti() module resolution (ESM + Node aliases)
├─ Import plugin entry point
├─ Execute plugin() factory
├─ Register hooks
├─ Register HTTP routes (if applicable)
└─ Initialize plugin state

Plugin Interfaces:
├─ ChannelPlugin     → Messaging integration
├─ AuthPlugin        → Model credentials (Claude, OpenAI, etc.)
├─ MemoryPlugin      → Vector store or session store
├─ HookPlugin        → Lifecycle events
├─ HTTPPlugin        → Custom HTTP endpoints
└─ CustomPlugin      → Domain-specific (e.g., voice-call)

Plugin Lifecycle Hooks:
├─ gateway.starting  → Before gateway initialization
├─ gateway.started   → After gateway ready
├─ gateway.stopping  → Before shutdown
├─ channel.connect   → Before channel connects
├─ channel.message   → Incoming message event
├─ agent.before-run  → Before agent execution
├─ agent.after-run   → After agent execution
└─ ... (20+ hooks)

Plugin Registry:
├─ Stores plugin instances
├─ Manages plugin state
├─ Enables/disables dynamically
└─ Cleanup on reload/shutdown

Plugin Installation:
├─ `npm install` in plugin dir (--omit=dev)
├─ Add to config: plugins.enabled[]
├─ Gateway reload or restart
└─ Hooks auto-register

Plugin SDK:
├─ createPlugin() factory
├─ @openclaw/plugin-sdk exports
├─ Zod schemas for validation
├─ TypeScript types
└─ Logger/config/storage APIs
```

**Key Files**:
- `src/plugins/loader.ts` - Plugin discovery & loading
- `src/plugins/manifest.ts` - Manifest parsing
- `src/plugins/registry.ts` - Plugin registry
- `src/plugins/hooks.ts` - Hook system
- `src/plugins/install.ts` - Installation flow
- `src/plugin-sdk/index.ts` - SDK exports
- `extensions/*/src/index.ts` - Plugin entry points

### C. Configuration System

**Location & Format**:
- **Main config**: `~/.openclaw/config.json5` (JSON5 format)
- **Sessions**: `~/.openclaw/sessions/` (directory of session files)
- **Credentials**: `~/.openclaw/credentials/` (auth tokens, stored securely)
- **Optional**: `.env` file for environment overrides

**Config Structure** (Zod-validated):

```typescript
{
  // Gateway settings
  gateway: {
    mode: "local" | "docker" | "remote"
    port: number
    bind: "loopback" | "all-interfaces" | IP
    tlsKey?: string
    tlsCert?: string
    adminKey?: string (optional auth)
  }

  // Model/AI settings
  models: {
    default: "claude" | "openai" | "ollama"
    profiles: {
      [profile_id]: {
        provider: "anthropic" | "openai" | ...
        model: string
        apiKey?: string (or via OAuth)
        baseURL?: string (for self-hosted)
      }
    }
  }

  // Channel configurations
  channels: {
    [channel_id]: {
      enabled: boolean
      config: {
        // channel-specific (token, webhook URL, etc.)
      }
    }
  }

  // Plugin configuration
  plugins: {
    enabled: string[] (plugin IDs to enable)
    [plugin_id]: {
      // plugin-specific config
    }
  }

  // Agent settings
  agents: {
    default: string (agent ID)
    [agent_id]: {
      workspace: string (path to agent workspace)
      concurrency: number
      models: string[]
    }
  }

  // Hooks/Extensions
  hooks: {
    modules: string[] (JS file paths for custom hooks)
  }

  // Advanced
  tools: {
    exec: {
      applyPatch: {
        workspaceOnly: boolean
      }
    }
    fs: {
      workspaceOnly: boolean
    }
  }

  // Cron jobs
  cron: {
    [job_id]: {
      schedule: "0 * * * *" (cron expression)
      command: string
    }
  }
}
```

**Config Loading Flow**:
```
loadConfig()
├─ Check for legacy config (migrate if needed)
├─ Read config.json5
├─ Apply environment overrides (.env)
├─ Validate with Zod schema
├─ Load plugin schemas (extend validation)
├─ Return validated config object
└─ Errors: detailed validation messages
```

**Hot Reload**:
- Gateway monitors config file for changes
- Triggers selective reload (channels, plugins, cron)
- Maintains uptime where possible

**Key Files**:
- `src/config/config.ts` - Main loader
- `src/config/zod-schema.ts` - Validation schema
- `src/config/io.ts` - Read/write operations
- `src/config/validation.ts` - Validation logic
- `src/config/legacy-migrate.ts` - Legacy migration

### D. Agent/AI System

**Architecture** (`src/agents/` + Pi SDK):

```
Agent Runtime
├─ Pi-Embedded Agent (via @mariozechner/pi-* packages)
│  ├─ Conversation management
│  ├─ Tool invocation
│  ├─ Multi-turn reasoning
│  └─ Thinking mode (long reasoning)
│
├─ Auth Profile System
│  ├─ Multiple model providers (Anthropic, OpenAI, Ollama)
│  ├─ OAuth token rotation
│  ├─ API key fallback
│  └─ Rate limiting per profile
│
├─ Tool Sandbox
│  ├─ bash-tools.ts → Execute shell commands safely
│  ├─ apply-patch.ts → Code patching
│  ├─ Browser control (Playwright)
│  ├─ File I/O (with workspace restriction)
│  ├─ Skills discovery (built-in + user)
│  └─ Tool approval system (for sensitive operations)
│
├─ Memory System
│  ├─ Vector embeddings (LanceDB or custom)
│  ├─ Session history (SQLite)
│  ├─ Conversation context
│  └─ Persistent facts/knowledge
│
├─ Multi-Agent Support
│  ├─ Multiple independent agents
│  ├─ Subagent registry
│  ├─ Agent switching
│  └─ Shared memory/knowledge
│
└─ Hooks/Lifecycle
   ├─ before-run
   ├─ after-run
   ├─ tool-invoke
   └─ message-processed
```

**Execution Flow**:
```
incoming message (channel)
  → gateway receives
  → extract agent ID
  → load/initialize agent
  ↓
agent.run({
  message: "user input",
  context: {...},
  modelProfile: "claude"
})
  ├─ Build prompt (system + conversation history)
  ├─ Call model API (with streaming)
  ├─ Process model response
  ├─ Check for tool calls
  ├─ Tool invocation sandbox
  │  ├─ Validate tool signature
  │  ├─ Check approval (if needed)
  │  ├─ Execute in bash sandbox
  │  └─ Return result
  ├─ Update memory
  └─ Return final response

final response
  ↓ (routed back to channel)
  send via channel
  ↓
user receives
```

**Key Files**:
- `src/agents/pi-embedded-runner/` - Pi SDK integration
- `src/agents/auth-profiles/` - Model auth management
- `src/agents/bash-tools.ts` - Tool execution
- `src/agents/apply-patch.ts` - Code patching
- `src/agents/subagent-registry.ts` - Multi-agent mgmt
- `src/memory/` - Memory system integration

**Built-in Skills** (`skills/`):

- `skills/browser/` - Web automation (Playwright)
- `skills/filesystem/` - File operations
- `skills/shell/` - OS shell commands
- `skills/github/` - GitHub API
- `skills/math/` - Mathematical operations
- `skills/memory/` - Memory management
- `skills/image-gen/` - Image generation (DALL-E, etc.)
- `skills/search/` - Web search
- `skills/email/` - Email integration
- ... (54 total)

### E. Gateway HTTP API

**Server Architecture** (`src/gateway/server-http.ts`):

```
Express Server (HTTP/WebSocket)

Endpoints:
├─ /api/rpc
│  └─ Unified RPC method dispatch
│     └─ 50+ gateway methods (see server-methods/)
│
├─ /control-ui/*
│  └─ Web dashboard (React app)
│     └─ Served from ui/dist/
│
├─ /__openclaw__/canvas/*
│  └─ Canvas host (interactive UI)
│     └─ Lit-based web components
│
├─ /__openclaw__/a2ui/*
│  └─ Alternative UI components
│
├─ /api/health
│  └─ Health check + status
│
├─ /api/probe
│  └─ Channel connectivity probe
│
└─ WebSocket /api/ws
   └─ Real-time events
      ├─ channel.message
      ├─ agent.event
      ├─ gateway.status
      └─ etc.

RPC Methods (src/gateway/server-methods/):
├─ agent.run
├─ channels.list
├─ channels.send
├─ config.get
├─ config.apply
├─ plugins.list
├─ plugins.install
├─ health.get
├─ cron.list
├─ hooks.call
└─ 40+ more

Auth:
├─ Optional admin key (config)
├─ Rate limiting (per IP/auth profile)
├─ Session key (for RPC calls)
└─ Device pairing (for mobile apps)

CORS & Security:
├─ Default: loopback only (127.0.0.1)
├─ No public internet exposure recommended
├─ TLS support (optional)
├─ Origin checking
└─ CSP headers for canvas
```

---

## Channel/Provider System

### How Messaging Works

**Channel Abstraction**:

Each channel is a plugin implementing:

```typescript
interface ChannelPlugin {
  id: string
  connect(config: Config): Promise<void>
  disconnect(): Promise<void>
  send(msg: Message): Promise<void>
  setHandlers({
    onMessage: (msg: Message) => void
    onError: (err: Error) => void
  }): void
  getCapabilities(): ChannelCapabilities
}
```

**Core Channel Examples**:

1. **Telegram Bot API**
   - Uses `@grammyjs` library
   - Polling or webhook (configurable)
   - Receives updates → normalizes → dispatches to agent
   - Sends responses back via Telegram API

2. **WhatsApp Web**
   - Headless browser automation via Playwright
   - QR code linking to personal WhatsApp account
   - Message interception from web interface
   - Rate limiting (respects WhatsApp throttling)

3. **Discord Bot API**
   - Uses Discord.js or raw API
   - Intents configuration (message content, etc.)
   - Slash commands support
   - Reactions and threading

4. **Slack (Socket Mode)**
   - WebSocket connection (Socket Mode)
   - No webhooks needed
   - Rich interaction (buttons, modals)
   - Thread support

5. **Signal (signal-cli)**
   - External `signal-cli` process (linked device)
   - REST API bridge
   - E2E encrypted messaging

6. **iMessage (BlueBubbles)**
   - Requires BlueBubbles server on macOS
   - REST API to BlueBubbles
   - Message sync

**Message Flow**:

```
Incoming Message
├─ Channel plugin receives
├─ Normalize to OpenClaw Message type:
│  {
│    id: string
│    channelId: string
│    sender: {
│      id: string
│      name: string
│      type: "user" | "bot"
│    }
│    content: {
│      text?: string
│      attachments?: []
│      reactions?: []
│    }
│    session: {
│      id: string
│      type: "dm" | "group"
│    }
│    timestamp: number
│  }
│
├─ Check allowlist
│  └─ Is sender allowed to message?
│
├─ Check pairing
│  └─ Is sender linked to an agent identity?
│
├─ Route to gateway chat handler (server-chat.ts)
│
├─ Dispatch to agent runner
│  ├─ agent.run(message)
│  └─ Get response
│
├─ Post-process response
│  ├─ Split long messages
│  ├─ Format for channel
│  └─ Attach media if needed
│
└─ Send back via channel plugin
   └─ Channel.send(response)
```

**Allowlists & Access Control** (`src/channels/allowlists/`):

```
Channel Config:
├─ allowlist.enabled
├─ allowlist.mode: "whitelist" | "blacklist"
├─ allowlist.rules: [
│    {
│      type: "user" | "group"
│      id: string
│      policy: "allow" | "block" | "approve"
│    }
│  ]
└─ dmpolicy: (direct message rules)

Routing Rules:
├─ Channel allowlist (who can use this channel)
├─ Command gating (which commands per user)
├─ Mention gating (require @ for bot)
├─ DM policy (accept/reject/request DMs)
└─ Pairing (link user account to agent identity)
```

---

## Plugin/Extension System

### Plugin Types

**1. Channel Plugins** (`extensions/*/src/channel.ts`)
- Add new messaging integrations
- Example: `extensions/matrix/`, `extensions/zalo/`

**2. Auth Plugins** (`extensions/*/src/auth.ts`)
- Add model provider integrations
- Example: `extensions/google-gemini-cli-auth/`

**3. Memory Plugins** (`extensions/memory-lancedb/`)
- Vector store backends (LanceDB, Pinecone, etc.)
- Session store backends (SQLite, etc.)

**4. Hook Plugins**
- Listen to lifecycle events
- Example: `extensions/diagnostics-otel/` (OpenTelemetry)

**5. Custom Domain Plugins**
- Voice calls, LLM tasks, Copilot proxy, etc.
- Example: `extensions/voice-call/`, `extensions/llm-task/`

### Plugin Directory Structure

```
extensions/my-plugin/
├── package.json
│  ├─ "name": "my-plugin"
│  ├─ "openclaw.plugin": "my-plugin"
│  ├─ "openclaw.type": "channel" | "auth" | "memory" | "custom"
│  ├─ "main": "dist/index.js"
│  └─ "types": "dist/index.d.ts"
│
├── src/
│  └── index.ts (plugin factory entry)
│
├── dist/
│  ├── index.js
│  └── index.d.ts
│
└── README.md
```

### Plugin Development

**Example: Channel Plugin**

```typescript
// extensions/my-channel/src/index.ts
import type { ChannelPlugin } from "@openclaw/plugin-sdk"

export default function createMyChannelPlugin(): ChannelPlugin {
  return {
    id: "my-channel",

    async connect(config) {
      // Initialize connection
      // Store handlers for later
    },

    async disconnect() {
      // Cleanup
    },

    async send(message) {
      // Send message to external service
    },

    setHandlers({ onMessage, onError }) {
      // Register handlers for receiving messages
      // Call onMessage(msg) when message arrives
    },

    getCapabilities() {
      return {
        supportsMedia: true,
        supportsReactions: false,
        supportsThreads: true,
      }
    },
  }
}
```

**Example: Hook Plugin**

```typescript
export default function createMyHookPlugin(): HookPlugin {
  return {
    hooks: {
      "gateway.started": async ({ gateway }) => {
        console.log("Gateway started!")
      },

      "agent.after-run": async ({ agent, response }) => {
        console.log("Agent response:", response.text)
      },
    },
  }
}
```

### Plugin Registry & Loading

```
src/plugins/loader.ts
├─ Scan extensions/ for package.json with openclaw.plugin
├─ Parse manifests (type, version, dependencies)
├─ Load enabled plugins from config
├─ Use jiti() for ESM module resolution
├─ Initialize plugin instances
├─ Register hooks
├─ Register HTTP routes
└─ Store in registry for runtime access
```

---

## Security & Sandboxing

### Threat Model

**Out of Scope** (per SECURITY.md):
- Public internet exposure (Gateway should be loopback-only)
- Prompt injection attacks
- Using OpenClaw against documentation recommendations

**In Scope**:
- Tool execution sandbox
- Plugin isolation
- Credential storage
- Rate limiting
- Device pairing security

### Sandboxing Mechanisms

**1. Tool Execution Sandbox** (`src/agents/bash-tools.ts`)

```
bash-tools.ts
├─ Executes agent tool calls in bash
├─ Subprocess isolation (node-pty)
├─ Optional: workspace-only restriction
│  └─ tools.exec.applyPatch.workspaceOnly: true
├─ Timeout enforcement (5m default)
├─ Stdout/stderr capture
├─ Exit code handling
└─ Environment variable filtering
```

**2. Approval System** (`src/gateway/exec-approval-manager.ts`)

```
Sensitive Operations:
├─ Code patching (apply_patch tool)
├─ Filesystem write (if workspace restricted)
├─ Shell execution (system_run tool)
└─ Network calls (certain tools)

Approval Flow:
├─ Tool marked as requires_approval
├─ Gateway creates approval request
├─ User sees in control UI
├─ User approves/rejects
├─ Tool continues or fails
└─ Audit log maintained
```

**3. Credential Storage** (`~/.openclaw/credentials/`)

```
~/.openclaw/
├─ config.json5 (main config, world-readable)
├─ credentials/   (API keys, tokens)
│  ├─ chmod 0700 (owner-only)
│  └─ Files: oauth-anthropic.json, api-key-openai.json, etc.
└─ sessions/     (agent session data)
```

**4. Gateway Binding** (Security-first defaults)

```
Default: loopback-only (127.0.0.1)
config: gateway.bind="loopback"

Recommendation: Never expose to public internet
├─ No direct 0.0.0.0 binding
├─ If remote access needed: SSH tunnel or Tailscale
└─ TLS not required (loopback assumption)
```

**5. Node.js Version Hardening**

```
Minimum: Node.js 22.12.0+
Enforces:
├─ CVE-2025-59466 fix (async_hooks DoS)
├─ CVE-2026-21636 fix (permission model bypass)
└─ Runtime assertion in src/infra/runtime-guard.ts
```

**6. Docker Security** (if containerized)

```
Official image:
├─ Runs as non-root user (node)
├─ Read-only filesystem (with --read-only)
├─ Capability dropping (--cap-drop=ALL)
└─ Volume mounts for data persistence
```

---

## Development Workflows

### Local Development

**Setup**:
```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# Install dependencies
pnpm install

# Build frontend
pnpm ui:build

# Build TypeScript
pnpm build

# Type check
pnpm tsgo
```

**Development Modes**:

```bash
# Run gateway in dev mode (auto-reload on changes)
OPENCLAW_SKIP_CHANNELS=1 pnpm gateway:dev

# Run CLI in dev mode
pnpm openclaw <command>

# Run TUI (terminal UI)
pnpm tui:dev

# Watch mode tests
pnpm test:watch

# Run specific test
pnpm test src/agents/agent-scope.ts
```

### Testing

**Test Framework**: Vitest (with 70% coverage thresholds)

```bash
# Run all tests
pnpm test

# Fast unit tests only
pnpm test:fast

# Coverage report
pnpm test:coverage

# Live tests (real API keys)
OPENCLAW_LIVE_TEST=1 pnpm test:live

# E2E tests
pnpm test:e2e

# Docker-based E2E
pnpm test:docker:live-gateway
pnpm test:docker:onboard
```

**Test Structure**:
- Colocated: `src/foo/bar.ts` → `src/foo/bar.test.ts`
- E2E: `*.e2e.test.ts`
- Live tests: `*.live.test.ts` (require env vars)

### Building & Release

**Build**:
```bash
pnpm build
# Outputs to dist/
```

**Release Channels**:
- **stable**: Tagged releases (`vYYYY.M.D`), npm dist-tag `latest`
- **beta**: Prerelease tags (`vYYYY.M.D-beta.N`)
- **dev**: Moving head on main (git install)

**macOS App**:
```bash
pnpm mac:package   # Build .dmg
```

**Publishing** (maintainers only):
```bash
npm publish --tag latest   # stable
npm publish --tag beta     # beta
```

### Commit & PR Guidelines

**Conventional Commits**:
```
<type>: <description>

- What: <specific changes>
- Why: <motivation>
- Impact: <affected areas>

Closes #<issue-number>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**PR Workflow**:
1. Create feature branch (`feat/issue-number-description`)
2. Make changes + tests
3. Run `pnpm check` (lint + format + type check)
4. Commit
5. Push & create PR
6. Wait for review/approval (maintainers)
7. Merge (maintainers only)

---

## Key Dependencies

### Core Frameworks

- **Node.js**: 22+ (LTS)
- **TypeScript**: 5.9+ (strict mode)
- **Express**: 5.2.1 (HTTP server)
- **Commander.js**: 14.0.3 (CLI framework)

### Messaging Integrations

- **@grammyjs**: Telegram Bot API wrapper
- **@slack/bolt**: Slack Socket Mode client
- **discord-api-types**: Discord type definitions
- **@line/bot-sdk**: LINE messaging
- **@whiskeysockets/baileys**: WhatsApp Web (reverse engineered)
- **grammy**: Telegram client library
- Signal REST via signal-cli wrapper

### AI/LLM

- **@mariozechner/pi-agent-core**: Pi SDK (agent runtime)
- **@mariozechner/pi-ai**: Pi SDK (AI integration)
- **@mariozechner/pi-tui**: Pi SDK (TUI)
- **@mariozechner/pi-coding-agent**: Pi SDK (coding)
- **@aws-sdk/client-bedrock**: AWS Bedrock support

### Browser & Automation

- **playwright-core**: 1.58.2 (headless browser control)
- **linkedom**: 0.18.12 (DOM implementation)

### Data & Storage

- **sqlite-vec**: 0.1.7-alpha (SQLite with vector extensions)
- **pdfjs-dist**: 5.4.624 (PDF reading)
- **sharp**: 0.34.5 (image processing)
- **yaml**: 2.8.2 (YAML parsing)
- **zod**: 4.3.6 (schema validation)

### Utilities

- **chalk**: 5.6.2 (colored terminal output)
- **dotenv**: 17.3.1 (.env loading)
- **@clack/prompts**: Interactive prompts
- **chokidar**: 5.0.0 (file watching)
- **jiti**: 2.6.1 (dynamic ESM module loading)
- **tar**: 7.5.9 (tarball extraction)

### Development

- **vitest**: 4.0.18 (testing framework)
- **oxfmt**: 0.33.0 (code formatting)
- **oxlint**: 1.48.0 (linting)
- **tsdown**: 0.20.3 (TypeScript bundling)
- **rolldown**: 1.0.0-rc.4 (alternative bundler)

---

## Configuration Management

### Default Locations

```
~/.openclaw/
├── config.json5           # Main configuration
├── sessions/
│  └── [agent_id]/         # Agent session data
├── credentials/           # OAuth tokens, API keys (0700)
├── plugins/               # Installed plugin cache?
└── logs/                  # Optional log files
```

### Config Validation

**Schema** (`src/config/zod-schema.ts`):
- Uses Zod for runtime validation
- Plugins can extend schema
- Detailed error messages on validation failure

**Loading** (`src/config/config.ts`):
```
loadConfig()
├─ Read config.json5
├─ Apply environment overrides (.env, process.env)
├─ Load plugin schemas (via plugins)
├─ Validate full config
├─ Migrate legacy format if needed
└─ Return typed config object
```

**Hot Reload**:
- `src/gateway/config-reload.ts` watches file
- Triggers selective reload on change
- Channels: restart affected channels
- Plugins: reload plugins
- Cron: update schedules

---

## Key Design Patterns

### Dependency Injection

```typescript
createDefaultDeps()
├─ Logger
├─ Config
├─ Storage
├─ Channel registry
└─ Agent registry
```

### Plugin System (Factory Pattern)

```typescript
export default function createPlugin() {
  return {
    id: "my-plugin",
    hooks: { ... },
    ...
  }
}
```

### Hooks (Observer Pattern)

```
Plugin registers hooks:
├─ "gateway.starting"
├─ "agent.before-run"
└─ "channel.message"

Gateway triggers hooks:
emit("agent.before-run", { agent, message })
│
└─→ all registered listeners called
```

### Middleware Chain

Express middleware:
```
Request
  ├─ Logger
  ├─ Auth (optional)
  ├─ CORS
  ├─ Body parser
  ├─ RPC dispatcher
  └─ Response handler
```

---

## Performance Considerations

### Concurrency

- **Agent concurrency**: `agents[agent_id].concurrency` (default: 1)
- **Channel handling**: Per-channel message queue
- **Worker threads**: Optional for heavy computation
- **Vitest**: Do not set workers > 16 (tried already)

### Memory

- **Session caching**: In-memory session store
- **Vector embeddings**: Optional (LanceDB) for long memory
- **Message history**: Configurable retention

### Scalability

- **Single-user by design**: Not meant for multi-user deployments
- **Multi-agent**: Separate agent instances supported
- **Distributed**: Agents can run on different machines (via RPC)

---

## Lessons Learned from Codebase

1. **Extensibility First**: Plugin system is well-designed, allows adding channels/auth without touching core
2. **Configuration as Code**: JSON5 + Zod validation is flexible and type-safe
3. **Security-First Defaults**: Loopback-only binding, workspace restriction options
4. **Modular Channel Architecture**: Each channel is independent plugin, easy to add new ones
5. **Comprehensive Testing**: Vitest + live tests + Docker E2E
6. **Agent SDK Abstraction**: Pi SDK handles complexity, plugins don't need to know model details
7. **Hook System**: Powerful for cross-cutting concerns (logging, auth, monitoring)
8. **Monorepo Benefits**: Shared types, coordinated releases, easy local development

---

## Summary

OpenClaw is a sophisticated, well-architected personal AI gateway system that:

1. **Unified Interface**: Single agent, multiple messaging channels
2. **Extensible**: Plugin system for channels, auth, memory, custom features
3. **Local-First**: All data on user's device, loopback-only by default
4. **Type-Safe**: Full TypeScript, Zod validation, strict mode
5. **Modular**: Clear separation of concerns (gateway, channels, plugins, agents)
6. **Production-Ready**: Comprehensive testing, error handling, monitoring
7. **Developer-Friendly**: Clear entry points, good documentation, sensible defaults

The codebase demonstrates best practices in:
- Monorepo organization (pnpm workspaces)
- Plugin/extension patterns
- Configuration management
- Error handling & logging
- Testing strategies
- Security sandboxing
- Cross-platform development (Node.js + native iOS/macOS/Android apps)
