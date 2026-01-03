# Oracle v2 - MCP Memory Layer

> "The Oracle Keeps the Human Human" - now queryable via MCP

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
# Install dependencies
pnpm install

# Index Oracle knowledge
pnpm run index

# Start services
pnpm run server      # HTTP API on :37778
cd frontend && pnpm dev  # React dashboard on :3000
```

## Services

| Service | Port | Command |
|---------|------|---------|
| HTTP API | 37778 | `pnpm run server` |
| React Dashboard | 3000 | `cd frontend && pnpm dev` |
| MCP Server | stdio | `pnpm run dev` |
| Drizzle Studio | local.drizzle.studio | `pnpm db:studio` |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /search?q=...` | Full-text search |
| `GET /consult?q=...` | Get guidance on decision |
| `GET /reflect` | Random wisdom |
| `GET /list` | Browse documents |
| `GET /stats` | Database statistics |
| `GET /graph` | Knowledge graph data |
| `GET /context` | Project context (ghq format) |
| `POST /learn` | Add new pattern |
| `GET /dashboard/*` | Dashboard API |

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
pnpm db:generate   # Generate migrations
pnpm db:migrate    # Apply migrations
pnpm db:push       # Push schema directly
pnpm db:pull       # Introspect existing DB
pnpm db:studio     # Open Drizzle Studio GUI
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
pnpm test              # Run 45 unit tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ORACLE_PORT` | 37778 | HTTP server port |
| `ORACLE_REPO_ROOT` | `/Users/nat/.../Nat-s-Agents` | Knowledge base root |

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
pnpm install
pnpm run index        # Index knowledge base
pnpm run server &     # Start HTTP API
cd frontend && pnpm dev  # Start React dashboard

# Build
pnpm build            # TypeScript compilation
```

## References

- [docs/API.md](./docs/API.md) - API documentation
- [docs/architecture.md](./docs/architecture.md) - Architecture details
- [Drizzle ORM](https://orm.drizzle.team/) - Database ORM
- [MCP SDK](https://github.com/anthropics/anthropic-sdk-typescript) - Protocol docs

---

**Status**: Production
**Created**: 2025-12-29
**Updated**: 2026-01-03
