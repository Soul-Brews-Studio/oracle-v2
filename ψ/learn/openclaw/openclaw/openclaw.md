# OpenClaw Learning Index

## Source
- **Origin**: ./origin/
- **GitHub**: https://github.com/openclaw/openclaw

## What It Is

Full-featured self-hosted personal AI assistant platform. 30+ messaging channels (WhatsApp, Telegram, Discord, Slack, Signal, LINE, iMessage, Matrix, Zalo, etc.), plugin/extension system, web dashboard, native apps (iOS/macOS/Android). Monorepo with 369 core modules + 41 extension plugins. The "batteries included" counterpart to NanoClaw's minimalist approach.

## Explorations

### 2026-02-17 1527 (default)
- [Architecture](2026-02-17/1527_ARCHITECTURE.md)
- [Code Snippets](2026-02-17/1527_CODE-SNIPPETS.md)
- [Quick Reference](2026-02-17/1527_QUICK-REFERENCE.md)

**Key insights**:
- 30+ channel providers including LINE — channel abstraction with factory pattern + hooks
- Plugin system: Channel, Auth, Memory, Hook, Custom types with priority-ordered lifecycle
- Gateway pattern: single WebSocket control plane on loopback, 50+ RPC methods
- Config: JSON5 + Zod validation with hot reload
- Skills platform with ClawHub registry (like npm for AI skills)
- NanoClaw is the minimalist fork — same creator, opposite philosophy

## vs NanoClaw

| Aspect | OpenClaw | NanoClaw |
|--------|----------|----------|
| Channels | 30+ | WhatsApp only |
| Modules | 369+ core | ~10 files |
| Config | JSON5 + Zod + 3 files | No config files |
| Plugins | 41+ extensions | Skills via Claude Code |
| Container | Docker/Podman sandbox | Apple Container/Docker |
| Agent | Pi SDK | Claude Agent SDK |
| Philosophy | Batteries included | Understand in 8 min |
| Token size | Large | 35k tokens |
