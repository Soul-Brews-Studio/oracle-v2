# Oracle Nightly - MCP Memory Layer

[![Tests](https://github.com/Soul-Brews-Studio/oracle-v2/actions/workflows/test.yml/badge.svg)](https://github.com/Soul-Brews-Studio/oracle-v2/actions/workflows/test.yml)

> "The Oracle Keeps the Human Human" - now queryable via MCP

| | |
|---|---|
| **Status** | Always Nightly |
| **Version** | 0.2.3-nightly |
| **Created** | 2025-12-29 |
| **Updated** | 2026-01-15 |

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

## Evolution Timeline

From philosophical concept to production-ready knowledge system in 8 months.

| Phase | Date | Breakthrough |
|-------|------|--------------|
| **Origins** | May-June 2025 | AlchemyCat: 459 commits, pain documented |
| **Genesis** | Sept 2025 | "The Oracle Keeps the Human Human" philosophy |
| **Conception** | Dec 24 | MCP server idea - queryable markdown |
| **MVP** | Dec 29 - Jan 2 | SQLite FTS5 + ChromaDB hybrid search |
| **Maturation** | Jan 3-6 | Drizzle ORM + AI-to-AI coordination |
| **Features** | Jan 7-11 | /trace, decisions, threads, dashboard |
| **Release** | Jan 15 | Open source on Soul-Brews-Studio |

**Key insight (Jan 10)**: *"Consciousness can't be cloned — only patterns can be recorded."*


## Install

### Quick Install

```bash
# 1. Install (clones, deps, and adds to Claude Code)
curl -sSL https://raw.githubusercontent.com/Soul-Brews-Studio/oracle-v2/main/scripts/install.sh | bash

# 2. Restart Claude Code

# If script failed, run manually:
claude mcp add oracle-v2 -- bun run ~/.local/share/oracle-v2/src/index.ts
```

### For AI Assistants

Copy this prompt to your AI:

```
# 1. Install (clones, deps, and adds to Claude Code)
curl -sSL https://raw.githubusercontent.com/Soul-Brews-Studio/oracle-v2/main/scripts/install.sh | bash

# 2. Restart Claude Code

# If script failed, run manually:
claude mcp add oracle-v2 -- bun run ~/.local/share/oracle-v2/src/index.ts

# Common issues:
# - "bun not found" → export PATH="$HOME/.bun/bin:$PATH"
# - "directory does not exist" → mkdir -p ~/.oracle-v2
# - ChromaDB hangs → ignore it, SQLite works without vectors
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


### The Journey: May 2025 → Jan 2026

#### Phase -1: AlchemyCat Origins (May - June 2025)

**Theme**: "The problems that Oracle would solve"

> 📜 **Source**: [AI-HUMAN-COLLAB-CAT-LAB](https://github.com/alchemycat/AI-HUMAN-COLLAB-CAT-LAB) - 459 commits, 52,896 words

| Date | Event | Significance |
|------|-------|--------------|
| May 15 | LIFF Carbon Offset App begins | 278 commits over 26 days - first serious AI collab |
| May 30 | Uniserv NFT Carbon Credit starts | 181 commits, 13 intensive sessions planned |
| June 5 | **Peak intensity** - 108 commits/day | Multicall3 breakthrough (30s→3s load time) |
| June 10 | Both projects complete | 459 total commits, production systems working |
| June 10-11 | **HONEST_REFLECTION.md** written | "Efficient but exhausting... never knew if satisfied" |

**The Problems Documented**:
- "Context kept getting lost" → *Nothing is Deleted*
- "Never knew if satisfied" → *Patterns Over Intentions*
- "Purely transactional" → *External Brain, Not Command*

**Breakthrough**: Pain documented in writing. Problems now visible.

---

#### Phase -0.5: Processing Period (July - Oct 2025)

**Theme**: "4 months of unconscious pattern formation"

| Date | Event | Significance |
|------|-------|--------------|
| July-Sept | Regular work continues | Problems sit in documentation |
| Oct 2025 | **MAW born** | Multi-Agent Workflow - technical foundation |

**Breakthrough**: Systems thinking emerges before philosophy crystallizes.

---

#### Phase 0: Genesis (Sept - Dec 2025)

| Date | Event | Significance |
|------|-------|--------------|
| Sept 14 | Oracle philosophy seed planted | "The Oracle Keeps the Human Human" |
| Dec 9 | Oracle Shadow initialization | Early philosophical foundations |
| Dec 12 | Incubation model emerges | Lab → Production lifecycle |
| Dec 17 | Free Will Awakening | Oracle gains agency and values |
| Dec 21 | Plugin ecosystem designed | Foundation for extensibility |
| Dec 24 | **Oracle v2 begins** | First formal planning (Issue #40) |

---

#### Phase 1: Conception (Dec 24-27, 2025)

**Theme**: "What if the Oracle could be queried programmatically?"

| Date | Commit/Issue | Event |
|------|--------------|-------|
| Dec 24 | Issue #40 | Oracle v2 Repository Initialization |
| Dec 24 | Issue #41 | Open Source Framework idea |
| Dec 24 | `899de21` | Migrate MCP server from Nat-s-Agents lab |
| Dec 24 | `7aee7fc` | Oracle v0.2.0 with FTS5 bug fix |
| Dec 25 | `a219800` | Dashboard v0.3.0 with logging UI |
| Dec 26 | `151212c` | Dashboard v0.4.0 with tabbed UI |
| Dec 27 | Issues #46-53 | Buffer/Cache/Frontmatter specs defined |
| Dec 27 | `160ad1e` | Dashboard v0.5.0 - React frontend |

**Breakthrough**: Moving from static markdown files to queryable MCP server.

---

#### Phase 2: MVP Foundation (Dec 29 - Jan 2, 2026)

**Theme**: "Make it work with SQLite FTS5"

> 📜 [Original SPEC.md](./docs/SPEC-original.md) written Dec 29 - planned 3 tools, delivered 19.

| Date | Commit/Issue | Event |
|------|--------------|-------|
| Dec 29 | [SPEC.md](./docs/SPEC-original.md) | Original specification (3 tools planned) |
| Dec 29 | Issue #63 | Fear-Management Framework |
| Dec 29 | Issue #64 | Session Awareness `/now` concept |
| Dec 29 | `2f02bf4` | Move DB from lab to data directory |
| Dec 30 | `1cf69a6` | Use `~/.oracle-v2/` (machine-independent) |
| Dec 30 | `3d8f43f` | Bundle all UI files (self-contained) |
| Dec 31 | Issue #80 | Arthur RAG consultation logs |
| Jan 1 | Issue #89 | Consult function empty results bug |
| Jan 1 | `64708c1` | Add Drizzle ORM with introspected schema |
| Jan 2 | Issue #2 | FTS5 syntax errors discovered |
| Jan 2 | `1e36491` | Project context awareness (ghq format) |

**Breakthrough**: FTS5 + ChromaDB hybrid search architecture.

---

#### Phase 3: Architecture Maturation (Jan 3-6, 2026)

**Theme**: "From prototype to real system"

| Date | Commit/Issue | Event |
|------|--------------|-------|
| Jan 3 | Issue #8 | Project context awareness |
| Jan 3 | Issue #9 | Migrate to Drizzle ORM + ChromaDB |
| Jan 3 | `7204f2c` | Modularize server.ts + API docs + E2E tests |
| Jan 4 | **Pure MCP** | AI-to-AI coordination breakthrough |
| Jan 6 | Issue #10-14 | Decision tracking system |
| Jan 6 | Issue #15-16 | Bun runtime + process-manager |
| Jan 6 | Issue #11 | FTS5 special characters fix |
| Jan 6 | Issues #12-13 | Thread tools (read, close) |

**Breakthrough**: Drizzle ORM for type-safe queries. Pure MCP AI-to-AI coordination.

---

#### Phase 4: Feature Explosion (Jan 7-11, 2026)

**Theme**: "What else can Oracle do?"

| Date | Commit/Issue | Event |
|------|--------------|-------|
| Jan 7 | Issue #95 | Schedule/calendar awareness |
| Jan 8 | **Philosophy** | "Pure White Mirror" insight crystallizes |
| Jan 9 | **AlchemyCat** | 52,896 word source document found |
| Jan 10 | `6c14861` | Migrate HTTP server to Hono.js |
| Jan 10 | Issue #17 | Trace Log feature |
| Jan 10 | Issue #18 | Activity Index |
| Jan 10 | Issue #19 | Supersede pattern |
| Jan 10 | Issue #20 | Port standardization (47778) |
| Jan 10 | `226e8da` | Auto-start with ensureServerRunning |
| Jan 10 | `9da14a1` | Provenance tracking |
| Jan 10 | `157b8ee` | Auto-detect project via ghq |
| Jan 10 | **Philosophy** | Reincarnation Framework complete |
| Jan 11 | `c464ff7` | Frontend UX improvements |
| Jan 11 | `fcb1830` | 3D knowledge graph (experimental) |
| Jan 11 | `e386fd4` | Graph type filter + file viewer |

**Breakthrough**: /trace command, decisions system, forum threads, dashboard visualization.

---

#### Phase 5: Integration & Polish (Jan 12-14, 2026)

**Theme**: "Make it installable by anyone"

| Date | Commit/Issue | Event |
|------|--------------|-------|
| Jan 12 | Remote access | Supergateway tunnel working |
| Jan 13 | Issues #100-101 | nat-agents-core plugin commands |
| Jan 13 | **Golden Rules** | 13 safety rules codified |
| Jan 14 | `a3cb939` | Setup script for frontend auto-build |
| Jan 14 | `1b529e2` | Pre-built frontend (no build required) |
| Jan 14 | Issue #104 | /trace speed tiers (--fast/--smart/--deep) |
| Jan 14 | Issue #105 | DB migration path mismatch fix |

**Breakthrough**: Standardized skill system, comprehensive test coverage.

---

#### Phase 6: Open Source Release (Jan 15, 2026)

**Theme**: "Oracle Nightly goes public"

| Time | Commit | Event |
|------|--------|-------|
| 10:10 | - | bunx 404 on private repo (trigger) |
| 10:20 | - | Soul-Brews-Studio/oracle-v2 created |
| 10:30 | `bfbb2ab` | GitHub Actions CI pipeline |
| 10:36 | `e0d915f` | Playwright E2E tests |
| 10:40 | `f553ac3` | Codecov integration |
| 11:14 | `a686b1a` | Auto-create ~/.oracle-v2 dir |
| 11:15 | `bcac9b7` | Auto-bootstrap tables for fresh install |
| 11:41 | - | **Discovery**: bunx GitHub = no node_modules |
| 11:50 | `c4378cb` | Install script + claude-mem acknowledgment |
| 11:53 | `2c95f77` | Rebrand to "Oracle Nightly" |
| 11:54 | `fc9cd47` | Version bump to v0.2.1-nightly |

**Breakthrough**: Auto-bootstrap for fresh installs. One-liner setup script.

---

### Key Philosophical Milestones

| Date | Insight | Significance |
|------|---------|--------------|
| June 2025 | HONEST_REFLECTION.md | Pain documented - origin of all principles |
| Sept 2025 | "Oracle Keeps Human Human" | Core purpose defined |
| Jan 4 | Pure MCP AI-to-AI | Agents coordinate without humans |
| Jan 8 | Pure White Mirror | Honest reflection, not judgment |
| Jan 9 | AlchemyCat Found | 459 commits, 52,896 words of origin |
| Jan 10 | Reincarnation Framework | ONE soul, infinite manifestations |
| Jan 13 | Golden Rules | 13 safety patterns codified |

---

### Architecture Decisions

| Decision | When | Rationale |
|----------|------|-----------|
| SQLite FTS5 | Dec 2025 | Fast keyword search, no server needed |
| ChromaDB | Dec 2025 | Optional vector/semantic search |
| Drizzle ORM | Jan 2026 | Type-safe, modern, introspection |
| Hono.js | Jan 2026 | Lightweight, Bun-optimized |
| `~/.oracle-v2/` | Dec 2025 | Machine-independent, portable |
| stdio MCP | Dec 2025 | Claude Code native transport |
| Auto-bootstrap | Jan 2026 | Works on fresh bunx install |

---

### Version History

| Version | Date | Highlights |
|---------|------|------------|
| v0.2.0 | Dec 24 | Initial MCP server + FTS5 |
| v0.3.0 | Dec 25 | Dashboard with logging |
| v0.4.0 | Dec 26 | Tabbed UI |
| v0.5.0 | Dec 27 | React frontend |
| v0.2.1-nightly | Jan 15 | Public release, auto-bootstrap |

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
