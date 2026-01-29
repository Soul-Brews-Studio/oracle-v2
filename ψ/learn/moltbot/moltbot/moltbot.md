# Moltbot Learning Index

## Source
- **Origin**: ψ/learn/moltbot/moltbot/origin/
- **GitHub**: https://github.com/moltbot/moltbot

## Latest Exploration
**Date**: 2026-01-27

**Files**:
- [[2026-01-27_ARCHITECTURE|Architecture]]
- [[2026-01-27_CODE-SNIPPETS|Code Snippets]]
- [[2026-01-27_QUICK-REFERENCE|Quick Reference]]

## Summary

Moltbot is a sophisticated personal AI assistant platform with these key characteristics:

### What It Is
- **Multi-channel AI assistant** — Unified inbox across 13+ messaging platforms (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix, etc.)
- **Local-first architecture** — WebSocket gateway runs on your devices, not cloud
- **Native companion apps** — macOS menu bar, iOS, Android with voice control and canvas

### Tech Stack
- **Runtime**: Node.js ≥22.12.0, TypeScript
- **Gateway**: WebSocket control plane with schema-driven protocol (Typebox + AJV)
- **Channels**: Plugin-based adapters (Baileys for WhatsApp, grammY for Telegram, Bolt for Slack)
- **Agent**: Pi agent runtime with streaming, tool execution, and approval gates
- **Native Apps**: SwiftUI (macOS/iOS), Android

### Key Patterns
1. **Gateway as Control Plane** — Single WebSocket for all operations
2. **Channel Plugin Interface** — Abstract adapter pattern for 12+ channels
3. **Tool-Centric Agent** — Browser, canvas, bash, cron, webhooks
4. **Security by Default** — DM pairing policy, Docker sandboxing, TCC permissions

### Interesting Code
- Smart process lifecycle with idempotency (GatewayProcessManager)
- Debounced UI state machines for smooth UX (HoverHUD)
- Type-safe IPC with associated-value enums (Request/Response)
- Observable AppState with preview safety for SwiftUI

## Timeline

### 2026-01-27 (First exploration)
- Initial discovery of moltbot codebase
- Core: Multi-channel AI assistant with local-first gateway architecture
- Notable: Sophisticated Swift macOS app with reactive patterns
