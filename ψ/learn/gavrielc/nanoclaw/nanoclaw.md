# NanoClaw Learning Index

## Source
- **Origin**: ./origin/
- **GitHub**: https://github.com/gavrielc/nanoclaw
- **Website**: https://nanoclaw.net

## What It Is

Personal Claude assistant that runs securely in Linux containers. WhatsApp I/O, isolated group contexts, scheduled tasks, agent swarms. Built to be understood in 8 minutes — one process, handful of files. Fork it, have Claude Code customize it for your needs.

## Explorations

### 2026-02-17 1510 (default)
- [Architecture](2026-02-17/1510_ARCHITECTURE.md)
- [Code Snippets](2026-02-17/1510_CODE-SNIPPETS.md)
- [Quick Reference](2026-02-17/1510_QUICK-REFERENCE.md)

**Key insights**:
- Single Node.js orchestrator + per-group container isolation (Apple Container on macOS, Docker on Linux)
- File-based IPC via JSON in /workspace/ipc/ — stateless, survives crashes
- First personal AI assistant to support Claude Agent SDK swarms
- Skills-over-features philosophy: contributors add /add-telegram skills, not telegram support
- Mount allowlist lives OUTSIDE project dir to prevent container tampering
