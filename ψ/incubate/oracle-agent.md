# Oracle Agent — Multi-Channel Personal Assistant

**Status**: Incubation
**Created**: 2026-02-17
**Author**: Nat + Oracle

## Vision

A lightweight multi-channel messaging agent that connects LINE, Discord, and Telegram to Oracle v2 as the brain. Users ask questions in their preferred messaging platform, Oracle searches its knowledge base, and replies with wisdom.

Inspired by NanoClaw's simplicity and OpenClaw's channel abstraction — but NanoClaw-simple: small codebase, understand in minutes.

## Architecture

```
Channel (LINE / Discord / Telegram)
    ↓ webhook / gateway
Hono Router → Channel Adapter (normalize message)
    ↓
Oracle Bridge → Oracle v2 HTTP API (search / consult / learn / reflect)
    ↓
Channel Adapter (format reply) → Send back
```

### Channel Adapter Interface

```typescript
interface ChannelAdapter {
  id: string;                           // "line" | "discord" | "telegram"
  setup(app: Hono): void;              // Register webhook routes
  send(to: string, text: string): Promise<void>;
  formatRich?(text: string): unknown;  // Optional rich formatting
}
```

Each channel is a plugin with a common interface. Adding a new channel = one file implementing `ChannelAdapter`.

### Oracle Bridge

HTTP client that talks to Oracle v2's API:
- `GET /api/search?q=...` — search knowledge base
- `GET /api/consult?q=...&context=...` — get guidance on decisions
- `POST /api/learn` — add new patterns/learnings
- `GET /api/reflect` — random wisdom

## Stack

- **Runtime**: Bun
- **HTTP**: Hono
- **LINE**: `@line/bot-sdk`
- **Discord**: `discord.js` (phase 2)
- **Telegram**: `grammY` (phase 2)
- **Oracle**: Oracle v2 HTTP API (localhost:47778)

## Project Structure

```
oracle-agent/
├── src/
│   ├── index.ts          # Hono server + channel registration
│   ├── oracle.ts         # Oracle v2 HTTP API client
│   └── channels/
│       ├── types.ts      # ChannelAdapter interface
│       ├── line.ts       # LINE adapter (phase 1)
│       ├── discord.ts    # Discord adapter (phase 2)
│       └── telegram.ts   # Telegram adapter (phase 2)
├── package.json
├── tsconfig.json
├── .env.example
├── CLAUDE.md
└── README.md
```

## Phases

### Phase 1 — MVP (LINE only)
- LINE Messaging API webhook receiver
- Signature validation (HMAC-SHA256)
- Trigger word detection (`@Oracle` or configurable)
- Oracle v2 API client (search, consult)
- Text reply via LINE reply API
- Environment: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `ORACLE_API_URL`

### Phase 2 — Multi-Channel
- Add Discord adapter (discord.js, slash commands)
- Add Telegram adapter (grammY, webhook mode)
- Rich formatting per channel (LINE Flex, Discord embeds, Telegram Markdown)
- Shared message normalization

### Phase 3 — Advanced
- Scheduled tasks (daily wisdom, reminders)
- Group isolation (per-group Oracle context)
- Container sandboxing for agent execution
- Conversation history / session memory

## Channels (Priority Order)

1. **LINE** — Thailand primary messaging, `@line/bot-sdk`
2. **Discord** — Dev community, `discord.js`
3. **Telegram** — Lightweight bot API, `grammY`

## Commands

| Command | Oracle API | Description |
|---------|-----------|-------------|
| `@Oracle search <query>` | `/api/search` | Search knowledge base |
| `@Oracle consult <decision>` | `/api/consult` | Get guidance |
| `@Oracle learn <pattern>` | `/api/learn` | Teach new pattern |
| `@Oracle reflect` | `/api/reflect` | Random wisdom |
| `@Oracle help` | — | Show available commands |

## Design Decisions

1. **Separate repo** — Not embedded in Oracle v2, keeps concerns clean
2. **HTTP API, not MCP** — Channels talk to Oracle via HTTP, simpler than MCP client
3. **Hono + Bun** — Same stack as Oracle v2 server, fast and lightweight
4. **Channel adapters as plugins** — Each channel is one file, easy to add
5. **Trigger word required** — Don't respond to every message in groups

## References

- NanoClaw: `ψ/learn/gavrielc/nanoclaw/` — Simplicity inspiration
- OpenClaw: `ψ/learn/openclaw/openclaw/` — Channel abstraction patterns
- Oracle v2 API: `src/server.ts` — HTTP endpoints
- LINE Bot SDK: https://github.com/line/line-bot-sdk-nodejs
