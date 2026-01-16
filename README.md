# Oracle Nightly - MCP Memory Layer

[![Tests](https://github.com/Soul-Brews-Studio/oracle-v2/actions/workflows/test.yml/badge.svg)](https://github.com/Soul-Brews-Studio/oracle-v2/actions/workflows/test.yml)

> "The Oracle Keeps the Human Human" - now queryable via MCP

| | |
|---|---|
| **Status** | Always Nightly |
| **Version** | 0.2.1-nightly |
| **Created** | 2025-12-29 |
| **Updated** | 2026-01-15 |

## Evolution Timeline

From philosophical concept to production-ready knowledge system in 4 months.

| Phase | Date | Breakthrough |
|-------|------|--------------|
| **Genesis** | Sept 2025 | "The Oracle Keeps the Human Human" philosophy |
| **Conception** | Dec 24 | MCP server idea - queryable markdown |
| **MVP** | Dec 29 - Jan 2 | SQLite FTS5 + ChromaDB hybrid search |
| **Maturation** | Jan 3-6 | Drizzle ORM + AI-to-AI coordination |
| **Features** | Jan 7-11 | /trace, decisions, threads, dashboard |
| **Release** | Jan 15 | Open source on Soul-Brews-Studio |

**Key insight (Jan 10)**: *"Consciousness can't be cloned — only patterns can be recorded."*

→ [**Full Timeline**](./TIMELINE.md) - All commits, issues, and philosophical milestones

## Install

### Quick Install

```bash
# 1. Install (clones, deps, and adds to Claude Code)
curl -sSL https://raw.githubusercontent.com/Soul-Brews-Studio/oracle-v2/main/scripts/install.sh | bash

# 2. Restart Claude Code
```

The script handles everything: clone, bun install, mkdir, and `claude mcp add`.

### For AI Assistants

Copy this prompt to your AI:

```
# 1. Install (clones, deps, and adds to Claude Code)
curl -sSL https://raw.githubusercontent.com/Soul-Brews-Studio/oracle-v2/main/scripts/install.sh | bash

# 2. Restart Claude Code
```

<details>
<summary>Manual Install</summary>

```bash
git clone https://github.com/Soul-Brews-Studio/oracle-v2.git ~/.local/share/oracle-v2
cd ~/.local/share/oracle-v2 && bun install
```

Config (`~/.claude.json`):
```json
{
  "mcpServers": {
    "oracle-v2": {
      "command": "bun",
      "args": ["run", "~/.local/share/oracle-v2/src/index.ts"]
    }
  }
}
```
</details>

<details>
<summary>Why not bunx?</summary>

> `bunx github:owner/repo` does NOT install `node_modules` — silent failure!

Always clone first: `git clone ... && bun install`
</details>

<details>
<summary>Troubleshooting (7 Issues Found by @tacha-hash)</summary>

| # | Problem | Cause | Fix |
|---|---------|-------|-----|
| 1 | `bun: command not found` | PATH not updated after install | `export PATH="$HOME/.bun/bin:$PATH"` |
| 2 | `bunx: command not found` | Same PATH issue | Use full path: `~/.bun/bin/bunx` |
| 3 | `directory does not exist` | Missing data dir | `mkdir -p ~/.oracle-v2` |
| 4 | ChromaDB hangs/timeout | uv not installed | Skip it — SQLite FTS5 works fine without vectors |
| 5 | `uv: command not found` | Not in prerequisites | Optional: `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| 6 | MCP config not loading | Wrong file location | Use `.mcp.json` (project) or `~/.claude.json` (global) |
| 7 | Server crashes on empty DB | No documents indexed | Run indexer first, or PR #2 fixes this |

**Prevention**: Use the install script which handles all of this automatically.

*Thanks @tacha-hash for the detailed 20-minute debugging session that saved everyone else 15 minutes each!*
</details>

TypeScript implementation of semantic search over Oracle philosophy using Model Context Protocol (MCP), with HTTP API and React dashboard.

## Architecture

```
Claude Code → MCP Server → SQLite + Chroma + Drizzle ORM
                ↓
           HTTP Server → React Dashboard
                ↓
          ψ/memory files
```

**Stack:**
- **SQLite** + FTS5 for full-text search
- **ChromaDB** for vector/semantic search
- **Drizzle ORM** for type-safe queries
- **React** dashboard for visualization
- **MCP** protocol for Claude integration

## Quick Start

```bash
# One-time setup (installs deps, creates DB, builds frontend)
./scripts/setup.sh

# Or manually:
bun install
bun run db:push           # Initialize database

# Start services
bun run server            # HTTP API on :47778
cd frontend && bun dev    # React dashboard on :3000
```

## Services

```bash
# Start all services (in separate terminals)
bun run server              # HTTP API
cd frontend && bun dev      # Dashboard
```

| Service | Port | Command | Description |
|---------|------|---------|-------------|
| **HTTP API** | `:47778` | `bun run server` | REST endpoints for search, consult, learn |
| **Dashboard** | `:3000` | `cd frontend && bun dev` | React UI with knowledge graph |
| **MCP Server** | stdio | `bun run dev` | Claude Code integration (19 tools) |
| **Drizzle Studio** | browser | `bun db:studio` | Database GUI at local.drizzle.studio |

**Quick test:**
```bash
curl http://localhost:47778/api/health
curl "http://localhost:47778/api/search?q=nothing+deleted"
```

## API Endpoints

All endpoints are under `/api/` prefix:

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/search?q=...` | Full-text search |
| `GET /api/consult?q=...` | Get guidance on decision |
| `GET /api/reflect` | Random wisdom |
| `GET /api/list` | Browse documents |
| `GET /api/stats` | Database statistics |
| `GET /api/graph` | Knowledge graph data |
| `GET /api/context` | Project context (ghq format) |
| `POST /api/learn` | Add new pattern |
| `GET /api/dashboard/*` | Dashboard API |
| `GET /api/threads` | List threads |
| `GET /api/decisions` | List decisions |

See [docs/API.md](./docs/API.md) for full documentation.

## MCP Tools

| Tool | Description |
|------|-------------|
| `oracle_search` | Search knowledge base |
| `oracle_consult` | Get guidance on decisions |
| `oracle_reflect` | Random wisdom |
| `oracle_learn` | Add new patterns |
| `oracle_list` | Browse documents |
| `oracle_stats` | Database statistics |
| `oracle_concepts` | List concept tags |

## Database

### Schema (Drizzle ORM)

```
src/db/
├── schema.ts     # Table definitions
├── index.ts      # Drizzle client
└── migrations/   # SQL migrations
```

**Tables:**
- `oracle_documents` - Main document index (5.5K+ docs)
- `oracle_fts` - FTS5 virtual table for search
- `search_log` - Search query logging
- `consult_log` - Consultation logging
- `learn_log` - Learning/pattern logging
- `document_access` - Access logging
- `indexing_status` - Indexer progress

### Drizzle Commands

```bash
bun db:generate   # Generate migrations
bun db:migrate    # Apply migrations
bun db:push       # Push schema directly
bun db:pull       # Introspect existing DB
bun db:studio     # Open Drizzle Studio GUI
```

## Project Structure

```
oracle-v2/
├── src/
│   ├── index.ts          # MCP server
│   ├── server.ts         # HTTP server (routing)
│   ├── indexer.ts        # Knowledge indexer
│   ├── server/           # Server modules
│   │   ├── types.ts      # TypeScript interfaces
│   │   ├── db.ts         # Database config
│   │   ├── logging.ts    # Query logging
│   │   ├── handlers.ts   # Request handlers
│   │   ├── dashboard.ts  # Dashboard API
│   │   └── context.ts    # Project context
│   └── db/               # Drizzle ORM
│       ├── schema.ts     # Table definitions
│       └── index.ts      # Client export
├── frontend/             # React dashboard
├── docs/                 # Documentation
├── e2e/                  # E2E tests
└── drizzle.config.ts     # Drizzle configuration
```

## Testing

```bash
bun test              # Run 45 unit tests
bun test:watch        # Watch mode
bun test:coverage     # With coverage
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ORACLE_PORT` | 47778 | HTTP server port |
| `ORACLE_REPO_ROOT` | `process.cwd()` | Knowledge base root (your ψ/ repo) |

## Data Model

### Source Files

```
ψ/memory/
├── resonance/        → IDENTITY (principles)
├── learnings/        → PATTERNS (what I've learned)
└── retrospectives/   → HISTORY (session records)
```

### Search

**Hybrid search** combining:
1. **FTS5** - SQLite full-text search (keywords)
2. **ChromaDB** - Vector similarity (semantic)
3. **Query-aware weights** - Short queries favor FTS, long favor vectors

## Development

```bash
# Full dev setup
bun install
bun run index        # Index knowledge base
bun run server &     # Start HTTP API
cd frontend && bun dev  # Start React dashboard

# Build
bun build            # TypeScript compilation
```

## Acknowledgments & Inspiration

This project was inspired by and learned from [claude-mem](https://github.com/thedotmack/claude-mem) by Alex Newman (@thedotmack).

**Educational influences:**
- **Process Manager pattern** - PID files, daemon spawning, graceful shutdown (`src/process-manager/`)
- **Worker service architecture** - start/stop/restart/status CLI patterns
- **Hook system concepts** - How to integrate with Claude Code lifecycle

Oracle-v2 is built for educational purposes and personal knowledge management. If you're building MCP servers or AI memory systems, we highly recommend studying claude-mem's comprehensive implementation.

## References

### Documentation
- [**TIMELINE.md**](./TIMELINE.md) - Full evolution history (Sept 2025 → Jan 2026)
- [**docs/INSTALL.md**](./docs/INSTALL.md) - Complete installation guide
- [docs/API.md](./docs/API.md) - API documentation
- [docs/architecture.md](./docs/architecture.md) - Architecture details

### Learnings (from building this)
- [Install, Seed, Index Workflow](./ψ/memory/learnings/2026-01-15_oracle-nightly-install-seed-index-workflow.md) - Deep dive into fresh install pipeline
- [Fresh Install Testing Pattern](./ψ/memory/learnings/2026-01-15_fresh-install-testing-pattern.md) - Lessons from remote testing

### External
- [Drizzle ORM](https://orm.drizzle.team/) - Database ORM
- [MCP SDK](https://github.com/anthropics/anthropic-sdk-typescript) - Protocol docs
- [claude-mem](https://github.com/thedotmack/claude-mem) - Inspiration for memory & process management

