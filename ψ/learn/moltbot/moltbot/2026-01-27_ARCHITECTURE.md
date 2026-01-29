# Moltbot Architecture Explorer

## Project Overview

**Moltbot** (also known as Clawdbot) is a personal AI assistant that runs locally and answers you through multiple channels (WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, BlueBubbles, Microsoft Teams, Matrix, Zalo, etc.). It's built in TypeScript/Node.js with support for macOS, iOS, and Android companion apps.

**Version**: 2026.1.26
**License**: MIT
**Runtime**: Node.js ≥22.12.0
**Package Manager**: pnpm@10.23.0

---

## Directory Structure

```
moltbot/
├── src/                          # Main TypeScript source
│   ├── entry.ts                  # CLI entry point (executable wrapper)
│   ├── index.ts                  # Main module export & program builder
│   ├── runtime.ts                # Runtime environment abstraction
│   ├── logging.ts                # Logging system
│   │
│   ├── cli/                      # Command-line interface layer
│   │   ├── program/              # Commander.js program configuration
│   │   │   ├── build-program.ts  # Main program builder
│   │   │   ├── command-registry.ts
│   │   │   ├── register.*.ts     # Individual command registrations
│   │   │   └── message/          # Message subcommand handlers
│   │   ├── gateway-cli/          # Gateway CLI module
│   │   ├── agent/                # Agent CLI module
│   │   ├── deps.ts               # Dependency injection
│   │   └── prompt.ts             # Interactive prompts
│   │
│   ├── gateway/                  # WebSocket gateway control plane
│   │   ├── protocol/             # Protocol definitions & schemas
│   │   │   ├── schema/           # JSON Schema definitions (Typebox)
│   │   │   │   ├── frames.ts     # Connection frames
│   │   │   │   ├── agent.ts      # Agent protocol
│   │   │   │   ├── channels.ts   # Channel protocol
│   │   │   │   ├── config.ts     # Config protocol
│   │   │   │   ├── cron.ts       # Cron protocol
│   │   │   │   └── ... (other schemas)
│   │   │   └── index.ts          # Protocol validation with AJV
│   │   ├── server-*.ts           # Server-side implementations
│   │   │   ├── server-channels.ts
│   │   │   ├── server-broadcast.ts
│   │   │   ├── server-browser.ts
│   │   │   └── ...
│   │   ├── session-*.ts          # Session management
│   │   └── auth.ts               # Authentication
│   │
│   ├── agents/                   # AI agent runtime & tools
│   │   ├── pi-embedded-runner/   # Pi agent runner (RPC mode)
│   │   ├── auth-profiles/        # Model auth profile management
│   │   ├── skills/               # Skill system
│   │   ├── tools/                # Agent tools
│   │   ├── bash-tools.ts         # Shell execution tools
│   │   ├── context.ts            # Agent context management
│   │   └── ... (auth, sandbox, schema files)
│   │
│   ├── channels/                 # Multi-channel adapters
│   │   ├── plugins/              # Channel plugin system
│   │   │   └── types.ts          # Channel adapter interfaces
│   │   ├── allowlists/           # Security allowlist management
│   │   ├── web/                  # WhatsApp web (Baileys)
│   │   ├── discord/              # Discord integration
│   │   ├── telegram/             # Telegram (grammY)
│   │   ├── slack/                # Slack (Bolt)
│   │   ├── signal/               # Signal integration
│   │   ├── imessage/             # iMessage integration
│   │   ├── line/                 # LINE integration
│   │   ├── types.ts              # Channel type definitions
│   │   └── ... (other channels)
│   │
│   ├── config/                   # Configuration system
│   │   ├── types/                # Config type definitions (modular)
│   │   │   ├── types.agents.ts
│   │   │   ├── types.channels.ts
│   │   │   ├── types.models.ts
│   │   │   ├── types.skills.ts
│   │   │   └── ... (all config types)
│   │   ├── schema.ts             # Zod schema definitions
│   │   ├── config.ts             # Config loader & validation
│   │   └── sessions/             # Session configuration
│   │
│   ├── commands/                 # High-level CLI commands
│   │   ├── onboarding/           # Onboarding wizard
│   │   ├── agent/                # Agent commands
│   │   ├── channels/             # Channel management
│   │   └── ...
│   │
│   ├── web/                      # WhatsApp web integration
│   │   ├── auto-reply.ts         # Automated message handling
│   │   ├── login.ts              # QR-code login
│   │   ├── monitor-inbox.ts      # Message monitoring
│   │   └── inbound.ts            # Inbound message routing
│   │
│   ├── infra/                    # Infrastructure utilities
│   │   ├── env.ts                # Environment variable handling
│   │   ├── ports.ts              # Port availability checking
│   │   ├── binaries.ts           # Binary management
│   │   ├── dotenv.ts             # .env loading
│   │   ├── warnings.ts           # Warning filtering
│   │   └── ...
│   │
│   ├── plugins/                  # Plugin system
│   │   ├── runtime/              # Plugin runtime
│   │   ├── http-registry.ts      # HTTP route registration
│   │   └── types.ts              # Plugin interfaces
│   │
│   ├── sessions/                 # Session management
│   │   └── types.ts              # Session types
│   │
│   ├── shared/                   # Shared utilities
│   │   └── text/                 # Text processing
│   │
│   ├── tui/                      # Terminal UI
│   │   ├── components/           # TUI components
│   │   └── theme/                # Themes
│   │
│   ├── media/                    # Media handling
│   │   └── understanding/        # Media understanding (AI)
│   │
│   ├── memory/                   # Memory/context management
│   ├── markdown/                 # Markdown processing
│   ├── tts/                      # Text-to-speech
│   ├── terminal/                 # Terminal utilities
│   ├── routing/                  # Message routing
│   ├── utils.ts                  # General utilities
│   └── ...
│
├── apps/                         # Native companion apps
│   ├── macos/                    # macOS app (Xcode project)
│   ├── ios/                      # iOS app
│   ├── android/                  # Android app
│   └── shared/                   # Shared app code
│
├── ui/                           # Web UI (React/Lit)
├── extensions/                   # Channel extensions
├── skills/                       # Bundled skills
├── scripts/                      # Build & dev scripts
├── test/                         # Test utilities
├── package.json                  # npm manifest
├── tsconfig.json                 # TypeScript config
├── vitest.config.ts              # Test configuration
├── Dockerfile                    # Docker build
└── ...
```

---

## Entry Points

### 1. CLI Entry (`/src/entry.ts`)
- **Purpose**: Shebang-enabled executable wrapper
- **Key Logic**:
  - Sets process title to "moltbot"
  - Manages experimental warnings via `NODE_OPTIONS`
  - Respawns process to apply configuration
  - Handles Windows argv normalization
  - Imports CLI profile application

### 2. Main Module (`/src/index.ts`)
- **Purpose**: Primary export and program initialization
- **Key Logic**:
  - Loads `.env` via `dotenv`
  - Normalizes environment variables
  - Ensures moltbot is on PATH
  - Enables console capturing for structured logging
  - Validates runtime (Node.js version)
  - Builds and exports the CLI program
- **Exports**: Core utilities (session management, config loading, etc.)

### 3. CLI Program (`/src/cli/program/build-program.ts`)
- **Purpose**: Assembles the Commander.js CLI program
- **Flow**:
  1. Creates Commander program instance
  2. Sets up program context (dependencies)
  3. Configures help system
  4. Registers pre-action hooks
  5. Registers all subcommands

---

## Core Abstractions & Key Types

### Gateway Protocol (`/src/gateway/protocol/`)
The gateway is a WebSocket control plane using a strict schema-driven protocol.

**Frame Types** (defined in `schema/frames.ts`):
- `ConnectParams` - Client connection
- `HelloOk` - Server greeting
- `EventFrame` - Event streaming
- `GatewayFrame` - Request/response wrapper

**Protocol Schemas** (Typebox):
- `agent.ts` - Agent operations (run, wait, identity, list)
- `channels.ts` - Channel management (status, logout)
- `config.ts` - Configuration (get, set, patch, apply)
- `cron.ts` - Scheduled jobs (add, remove, run, list)
- `sessions.ts` - Session operations
- `devices.ts` - Device pairing & tokens
- `exec-approvals.ts` - Shell command approval
- `logs-chat.ts` - Chat logs & tail

**Protocol Validation** (`/src/gateway/protocol/index.ts`):
- Uses AJV for JSON Schema validation
- Generates validators for all frame types
- Provides error handling with schema-aware diagnostics

### Configuration System (`/src/config/`)

**Type Hierarchy** (all exported via `types.ts`):
- `MoltbotConfig` - Root config type
- `AgentDefaults` - Default agent settings
- `AgentConfig` - Per-agent configuration
- `ChannelConfig` - Per-channel configuration
- `ModelConfig` - LLM model authentication
- `SkillConfig` - Skill configuration
- `ToolConfig` - Tool configuration

**Configuration Features**:
- Modular type definitions (one per concern)
- Zod-based validation (`schema.ts`)
- YAML/JSON support
- Session override capability
- Auth profile rotation

### Channel System (`/src/channels/`)

**Channel Plugin Interface** (`plugins/types.ts`):
```typescript
export type ChannelPlugin = {
  meta: ChannelMeta;
  setup?: ChannelSetupAdapter;
  auth?: ChannelAuthAdapter;
  messaging?: ChannelMessagingAdapter;
  outbound?: ChannelOutboundAdapter;
  status?: ChannelStatusAdapter;
  security?: ChannelSecurityAdapter;
  directory?: ChannelDirectoryAdapter;
  heartbeat?: ChannelHeartbeatAdapter;
  // ... more adapters
};
```

**Supported Channels**:
- **WhatsApp** - Baileys (web-based)
- **Telegram** - grammY bot framework
- **Slack** - Bolt framework
- **Discord** - discord.js
- **Google Chat** - Native API
- **Signal** - signal-cli
- **iMessage** - imsg (macOS)
- **BlueBubbles** - Extension protocol
- **Microsoft Teams** - Extension protocol
- **Matrix** - Extension protocol
- **Zalo** - Extension protocol
- **LINE** - LINE Bot API
- **WebChat** - Built-in web interface

**Key Abstractions**:
- `ChannelAccountState` - Account authentication state
- `ChannelResolveResult` - Message recipient resolution
- `DmPolicy` - Direct message security policy (pairing/open)
- `ChannelCapabilities` - Feature matrix (mentions, reactions, etc.)

### Agent Runtime (`/src/agents/`)

**Pi Agent Runner** (`pi-embedded-runner/`):
- Runs Anthropic's Pi agent in RPC mode
- Handles streaming (tool & block streaming)
- Manages context window with compaction
- Supports tool execution with approval gates
- Implements cache tracing & token optimization

**Authentication Profiles** (`auth-profiles/`):
- Multiple model auth support (OpenAI, Anthropic, AWS Bedrock)
- OAuth flow integration
- Failover/rotation logic (`order.ts`)
- Health checking & repair
- Usage tracking

**Core Files**:
- `context.ts` - Agent execution context
- `bash-tools.ts` - Shell execution with PTY support
- `channel-tools.ts` - Channel-specific tools
- `auth-health.ts` - Auth profile validation

### Plugin SDK (`/src/plugin-sdk/index.ts`)
Exports public API for third-party plugins:
- Channel adapter types
- Plugin runtime interface
- Config schema utilities
- HTTP route registration
- Action names & capabilities

---

## Dependencies

### Core Runtime
- **node** ≥22.12.0
- **TypeScript** 5.9.3
- **tsx** 4.21.0 - TypeScript execution

### Framework & Libraries
- **commander** 14.0.2 - CLI parsing
- **hono** 4.11.4 - HTTP framework
- **express** 5.2.1 - HTTP server
- **ws** 8.19.0 - WebSocket

### Channel Integrations
- **@whiskeysockets/baileys** 7.0.0-rc.9 - WhatsApp web
- **grammy** 1.39.3 - Telegram bot
- **@slack/bolt** 4.6.0 - Slack apps
- **@line/bot-sdk** 10.6.0 - LINE messaging

### AI Models
- **@mariozechner/pi-agent-core** 0.49.3 - Pi agent
- **@mariozechner/pi-ai** 0.49.3 - AI utilities
- **@agentclientprotocol/sdk** 0.13.1 - Agent protocol
- **@aws-sdk/client-bedrock** 3.975.0 - AWS Bedrock

### Media & Content
- **sharp** 0.34.5 - Image processing
- **pdfjs-dist** 5.4.530 - PDF handling
- **@mozilla/readability** 0.6.0 - Web content extraction
- **playwright-core** 1.58.0 - Browser automation
- **node-edge-tts** 1.2.9 - Text-to-speech

### Utilities
- **zod** 4.3.6 - Schema validation
- **ajv** 8.17.1 - JSON Schema validation
- **@sinclair/typebox** 0.34.47 - JSON Schema builder
- **chalk** 5.6.2 - Terminal colors
- **croner** 9.1.0 - Cron scheduling
- **yaml** 2.8.2 - YAML parsing
- **sqlite-vec** 0.1.7-alpha.2 - Vector storage

### Development & Testing
- **vitest** 4.0.18 - Test framework
- **oxlint** 1.41.0 - Fast linter
- **oxfmt** 0.26.0 - Code formatter
- **rolldown** 1.0.0-rc.1 - Bundler
- **wireit** 0.14.12 - Task coordination

---

## Build & Run

### Build Process (`package.json` scripts)

```bash
# Production build
pnpm build
  # Runs: pnpm canvas:a2ui:bundle && tsc -p tsconfig.json
  # Outputs: dist/

# Development watch
pnpm dev                    # Run with auto-reload
pnpm gateway:dev            # Gateway with hot reload
pnpm tui                    # Terminal UI mode

# UI build
pnpm ui:build               # Build React/Lit components
pnpm ui:dev                 # Dev server for UI
```

**TypeScript Config** (`tsconfig.json`):
- Target: ES2022
- Module: NodeNext (ESM)
- Strict mode enabled
- Output: dist/
- Tests excluded from build

### Development Build Script (`scripts/run-node.mjs`)
- Runs TypeScript directly via tsx
- Watches src/ for changes
- Auto-rebuilds on file modification
- Excludes .test.ts files from watch
- Compares build timestamps to avoid unnecessary rebuilds

### Docker Build
**Dockerfile**:
- Base: node:22-bookworm
- Installs Bun for build scripts
- Runs `pnpm install --frozen-lockfile`
- Builds TypeScript & UI
- Runs as non-root user (node)
- CMD: `node dist/index.js`

---

## CLI Commands Structure

### Main Commands (`/src/cli/program/command-registry.ts`)

**Setup & Onboarding**:
- `onboard` - Interactive setup wizard
- `configure` - Edit configuration

**Execution**:
- `gateway` - Run the WebSocket control plane
- `agent` - Execute an AI agent query
- `message send` - Send message to channel
- `status` - Check system status

**Maintenance**:
- `doctor` - Diagnose configuration issues
- `update` - Update Moltbot version
- `pairing` - Manage channel DM pairing

**Channel Operations**:
- `channels logout` - Disconnect channel
- `channels status` - List channel connections

**Cron & Automation**:
- `cron add` - Schedule a job
- `cron list` - List scheduled jobs
- `cron run` - Execute a cron job

**Advanced**:
- `nodes` - Manage connected nodes
- `models list` - List available AI models
- `wizard` - Run setup wizard

---

## Plugin System

### Plugin Runtime (`/src/plugins/runtime/`)
- Loads plugin modules at runtime
- Provides plugin context (gateway access)
- Manages HTTP route registration
- Handles plugin lifecycle

### Plugin SDK Exports (`/src/plugin-sdk/index.ts`)
- **Channel Types**: ChannelPlugin, ChannelAdapter interfaces
- **Plugin Interface**: MoltbotPluginApi, MoltbotPluginService
- **Config**: emptyPluginConfigSchema, config type definitions
- **Utilities**: HTTP path normalization, route registration

### Example: Channel Extension Plugin
Implements `ChannelPlugin` interface with adapters for:
- Authentication (OAuth flows)
- Message sending/receiving
- Group management
- Directory queries
- Reaction handling
- Thread support

---

## Testing

### Test Configuration
- **Unit Tests**: `vitest.config.ts` (default)
- **E2E Tests**: `vitest.e2e.config.ts`
- **Live Model Tests**: `vitest.live.config.ts`
- **Coverage Threshold**: 70% (lines, functions, branches, statements)

### Test Commands
```bash
pnpm test                  # Run all unit tests
pnpm test:watch          # Watch mode
pnpm test:coverage       # Generate coverage report
pnpm test:e2e            # End-to-end tests
pnpm test:live           # Live model tests (requires API keys)
pnpm test:docker:all     # Full Docker test suite
```

### Testing Patterns
- Comprehensive .test.ts files alongside implementation
- Test helpers in test-helpers.ts files
- Docker-based E2E tests for channel integrations
- Live model testing with actual API calls

---

## Key Architectural Patterns

### 1. **Gateway as Control Plane**
- Single WebSocket connection for all operations
- Schema-driven protocol with strict validation
- Event streaming for real-time updates
- Enables remote clients (CLI, apps, extensions)

### 2. **Channel as Plugin Interface**
- Abstract adapter pattern for channel implementations
- Consistent interface across 12+ channels
- Security policies (DM allowlists, pairing)
- Capability matrix for feature detection

### 3. **Config as Code**
- Modular, type-safe configuration
- Multiple input formats (YAML, JSON, CLI)
- Schema validation (Zod + JSON Schema)
- Session overrides for per-agent customization

### 4. **Tool-Centric Agent**
- Pi agent runtime with RPC interface
- First-class tools: browser, canvas, bash, channels
- Streaming for real-time interaction
- Approval gates for sensitive operations

### 5. **Multi-Layer CLI**
- Commander.js for argument parsing
- Context dependency injection
- Sub-CLIs for complex operations (gateway, wizard, doctor)
- Pre-action hooks for setup/validation

---

## Security & Deployment

### Security Defaults
- **DM Policy**: Pairing-based (unknown senders get code)
- **Allowlists**: Per-channel sender filtering
- **Device Pairing**: Token-based device authentication
- **Approval Gates**: Bash tool execution requires approval
- **Docker**: Runs as non-root user

### Deployment Options
1. **Local**: `pnpm build && node dist/index.js`
2. **Docker**: `docker build -t moltbot . && docker run moltbot`
3. **Systemd/launchd**: Install daemon service
4. **Cloud**: Fly.io (fly.toml provided)
5. **Mobile**: iOS/Android companion apps

---

## Development Workflow

### From Source
```bash
git clone https://github.com/moltbot/moltbot.git
cd moltbot
pnpm install
pnpm ui:build
pnpm build
pnpm moltbot onboard --install-daemon
pnpm gateway:watch        # Dev loop
```

### Contribution Path
1. Check GitHub Issues for "good first issue"
2. Discuss architecture changes in Discussions
3. Create focused PRs
4. Run linter: `pnpm lint`
5. Include tests for new features

### AI-Assisted Development
- AI/Claude-generated code welcome with transparency
- Mark in PR title/description
- Include testing notes
- Link session logs if helpful

---

## Performance Optimizations

1. **Context Window Management**: Compaction strategy for long conversations
2. **Token Optimization**: Cache tracing, efficient model selection
3. **Media Pipeline**: Async processing, size caps, temp cleanup
4. **Message Batching**: Coalescing for block streaming
5. **Connection Pooling**: Reuse for channels and APIs

---

## Project File References

- **Main Files**:
  - `/src/entry.ts` - Executable wrapper
  - `/src/index.ts` - Program builder & exports
  - `/src/cli/program/build-program.ts` - CLI structure
  - `/src/gateway/protocol/index.ts` - Protocol validation
  - `/src/config/types.ts` - Config system

- **Key Modules**:
  - `/src/agents/pi-embedded-runner/` - Agent runtime
  - `/src/channels/plugins/types.ts` - Channel interface
  - `/src/gateway/server-*.ts` - Gateway implementation
  - `/src/commands/onboarding/` - Setup wizard

- **Configuration**:
  - `package.json` - Dependencies & scripts
  - `tsconfig.json` - TypeScript compilation
  - `Dockerfile` - Container build
  - `vitest.config.ts` - Test setup
