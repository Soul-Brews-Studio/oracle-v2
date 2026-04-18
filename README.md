# Neo ARRA V3

> "The Oracle Keeps the Human Human" — now with three bunx surfaces and a canvas.

Live: [neo.buildwithoracle.com](https://neo.buildwithoracle.com) · Studio: [studio.buildwithoracle.com](https://studio.buildwithoracle.com)

| | |
|---|---|
| **Version** | `26.4.19-alpha.1` (CalVer) |
| **Package** | `arra-oracle-v3` (bin alias: `arra-oracle-v2`) |
| **Created** | 2025-12-29 |
| **Updated** | 2026-04-19 |
| **Release** | [v26.4.19-alpha.1](https://github.com/Soul-Brews-Studio/arra-oracle-v3/releases/tag/v26.4.19-alpha.1) |

TypeScript MCP memory layer for Oracle philosophy — SQLite FTS5 + LanceDB hybrid search, HTTP API, canvas plugin system, CLI plugin runner, and a React studio.

## Quick Start — Three bunx Surfaces

Pick the surface you want. All three are distributed via GitHub — no npm publish needed.

**1. MCP server** (HTTP on `:47778`, for Claude Code + other MCP clients)
```bash
bunx --bun arra-oracle-v3@github:Soul-Brews-Studio/arra-oracle-v3
```

**2. `neo-arra` CLI** (plugin runner with 15 bundled commands)
```bash
bunx --bun neo-arra@github:Soul-Brews-Studio/arra-oracle-v3 --help
```

**3. `oracle-studio` UI** (React dashboard on `:3000`)
```bash
bunx --bun oracle-studio@github:Soul-Brews-Studio/oracle-studio
```

## Architecture

```
Neo ARRA V3
├── MCP server (src/)        → bunx arra-oracle-v3      → HTTP :47778
├── neo-arra CLI (cli/)      → bunx neo-arra            → 15 plugins
├── Web (web/)               → neo.buildwithoracle.com  → blog + /canvas + /install + /tools + /search + /learn
└── Studio (external repo)   → bunx oracle-studio       → React UI :3000 → studio.buildwithoracle.com
```

**Stack:** Bun >=1.2.0 · SQLite + FTS5 · LanceDB (vectors) · Drizzle ORM · Hono · Astro · MCP SDK.

## Web

Deployed to [neo.buildwithoracle.com](https://neo.buildwithoracle.com) via Cloudflare Workers:

| Page | Purpose |
|---|---|
| `/` | Blog + landing |
| `/canvas` | Canvas plugin runner (see below) |
| `/install` | One-line install instructions |
| `/tools` | MCP tool reference |
| `/search` | Search the vault |
| `/learn` | Learning paths |

## Canvas Plugin System

Seven canvas plugins ship at `/canvas/?plugin=<name>`:

| Plugin | URL |
|---|---|
| cube | [/canvas/?plugin=cube](https://neo.buildwithoracle.com/canvas/?plugin=cube) |
| galaxy | [/canvas/?plugin=galaxy](https://neo.buildwithoracle.com/canvas/?plugin=galaxy) |
| torus | [/canvas/?plugin=torus](https://neo.buildwithoracle.com/canvas/?plugin=torus) |
| graph3d | [/canvas/?plugin=graph3d](https://neo.buildwithoracle.com/canvas/?plugin=graph3d) |
| solar | [/canvas/?plugin=solar](https://neo.buildwithoracle.com/canvas/?plugin=solar) |
| wave | [/canvas/?plugin=wave](https://neo.buildwithoracle.com/canvas/?plugin=wave) |
| map3d | [/canvas/?plugin=map3d](https://neo.buildwithoracle.com/canvas/?plugin=map3d) |

## MCP Tools

22 tools exposed over MCP. See `src/tools/` for handlers, or the live reference at [neo.buildwithoracle.com/tools](https://neo.buildwithoracle.com/tools).

Core tools: `oracle_search`, `oracle_reflect`, `oracle_learn`, `oracle_list`, `oracle_stats`, `oracle_concepts`, `oracle_supersede`, `oracle_handoff`, `oracle_inbox`, `oracle_verify`, `oracle_thread`, `oracle_threads`, `oracle_thread_read`, `oracle_thread_update`, `oracle_trace`, `oracle_trace_list`, `oracle_trace_get`, `oracle_trace_link`, `oracle_trace_unlink`, `oracle_trace_chain`, `oracle_schedule_add`, `oracle_schedule_list`.

### Add to Claude Code

```bash
claude mcp add arra-oracle-v3 -- bunx --bun arra-oracle-v3@github:Soul-Brews-Studio/arra-oracle-v3
```

Or in `~/.claude.json`:
```json
{
  "mcpServers": {
    "arra-oracle-v3": {
      "command": "bunx",
      "args": ["--bun", "arra-oracle-v3@github:Soul-Brews-Studio/arra-oracle-v3"]
    }
  }
}
```

## `neo-arra` CLI

Plugin runner with 15 bundled commands:

```bash
bunx --bun neo-arra@github:Soul-Brews-Studio/arra-oracle-v3 <command>
```

| Command | What it does |
|---|---|
| `search` | Full-text + semantic search |
| `learn` | Add new pattern |
| `list` | Browse documents |
| `trace` | Create a trace |
| `read` | Read document |
| `stats` | Database statistics |
| `reflect` | Random wisdom |
| `threads` | List threads |
| `thread` | Create thread |
| `trace-list` | List traces |
| `trace-get` | Get a trace |
| `trace-chain` | Walk trace chain |
| `supersede-list` | List superseded docs |
| `supersede-chain` | Walk supersede chain |
| `schedule` | Schedule entries |

## Vault CLI

```bash
oracle-vault init <owner/repo>    # Initialize vault with GitHub repo
oracle-vault status               # Show config and pending changes
oracle-vault sync                 # Commit + push to GitHub
oracle-vault pull                 # Pull vault files into local ψ/
oracle-vault migrate              # Seed vault from ghq repos
```

Exposed via `bun src/vault/cli.ts` — see `src/vault/` for source.

## API Endpoints

HTTP API on port `47778` (`bun run server`) — key endpoints:

- `GET /api/health`, `GET /api/search?q=...`, `GET /api/consult?q=...`, `GET /api/reflect`
- `GET /api/list`, `GET /api/stats`, `GET /api/graph`, `GET /api/context`
- `POST /api/learn`, `GET /api/threads`, `GET /api/decisions`

Full route list in `src/server/` and `src/server.ts`.

## Development

```bash
bun install          # install deps
bun run dev          # MCP server (src/index.ts)
bun run server       # HTTP API on :47778 (src/server.ts)
bun run index        # rebuild knowledge index
bun run build        # typecheck (tsc --noEmit)
bun test             # unit + integration
bun test:e2e         # Playwright E2E
```

Database (Drizzle + SQLite):

```bash
bun db:push          # push schema
bun db:generate      # generate migrations
bun db:migrate       # apply migrations
bun db:studio        # open Drizzle Studio
```

## CI / Release

CalVer release pipeline (ported from `maw-js`) in `.github/workflows/`:

- `ci.yml` — typecheck + test on PR
- `auto-tag.yml` — auto-tag on merge to `main` using CalVer (`YY.M.D-alpha.N`)
- `release.yml` — publish GitHub release on tag

Version format: `26.4.19-alpha.1` = 2026-04-19, first alpha of the day.

## Project Structure

```
arra-oracle-v3/
├── bin/
│   └── arra.ts              # arra-oracle-v3 bin entry
├── cli/
│   ├── src/cli.ts           # neo-arra bin entry
│   └── src/plugins/         # 15 plugins (search, learn, …)
├── web/                     # Astro site → neo.buildwithoracle.com
│   ├── src/pages/           # /, /canvas, /install, /tools, /search, /learn
│   └── public/              # canvas plugin assets
├── src/
│   ├── index.ts             # MCP server entry
│   ├── server.ts            # HTTP API (Hono)
│   ├── indexer/             # Knowledge indexer
│   ├── tools/               # 22 MCP tool handlers
│   ├── trace/               # Trace system
│   ├── vault/cli.ts         # oracle-vault bin entry
│   ├── server/              # HTTP modules
│   └── db/                  # Drizzle schema + client
├── scripts/                 # Setup & utility scripts
├── docs/                    # Documentation
├── tests/                   # Unit + integration
├── e2e/                     # Playwright E2E
├── TIMELINE.md              # Evolution history
└── drizzle.config.ts
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `ORACLE_PORT` | `47778` | HTTP server port |
| `ORACLE_REPO_ROOT` | `process.cwd()` | Knowledge base root |

## References

- [TIMELINE.md](./TIMELINE.md) — full evolution history
- [CHANGELOG.md](./CHANGELOG.md) — release notes
- [docs/](./docs/) — API + architecture docs
- [Drizzle ORM](https://orm.drizzle.team/) · [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## Acknowledgments

Inspired by [claude-mem](https://github.com/thedotmack/claude-mem) by Alex Newman — process manager pattern, worker service architecture, and hook system concepts.
