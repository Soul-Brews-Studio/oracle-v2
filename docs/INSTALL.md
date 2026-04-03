# Arra Oracle Installation Guide

Complete guide for fresh installation with seed data.

## Quick Install (Recommended)

```bash
curl -sSL https://raw.githubusercontent.com/Soul-Brews-Studio/arra-oracle-v2/main/scripts/fresh-install.sh | bash
```

This one-liner will:
1. Clone to `~/.local/share/arra-oracle-v2`
2. Install dependencies
3. Create seed philosophy files
4. Index seed data (29 documents)
5. Run tests

## What Gets Created

### Installation Directory
```
~/.local/share/arra-oracle-v2/    # Code
~/.oracle/                 # Data
├── oracle.db                 # SQLite database
└── seed/                     # Seed philosophy files
    └── ψ/memory/
        ├── resonance/        # Core principles
        │   ├── oracle.md
        │   ├── patterns.md
        │   └── style.md
        └── learnings/        # Example learning
```

### Seed Philosophy Content

**oracle.md** - Core Oracle Philosophy:
- Nothing is Deleted (append only)
- Patterns Over Intentions (observe behavior)
- External Brain, Not Command (mirror, don't decide)

**patterns.md** - Decision Patterns:
- Ask first before destructive actions
- Show don't tell
- Commit often

**style.md** - Communication Style:
- Direct, Concise, Technical when needed, Human always

## Post-Install Verification

### 1. Start Server
```bash
cd ~/.local/share/arra-oracle-v2
bun run server
```

### 2. Check Stats
```bash
curl http://localhost:47778/api/stats
```

Expected: `{"total": 29, "by_type": {"learning": 3, "principle": 26}}`

### 3. Test Search
```bash
curl "http://localhost:47778/api/search?q=nothing+deleted"
```

Expected: Top result is "Nothing is Deleted" principle

## Claude Code Configuration

Add to `~/.claude.json`:
```json
{
  "mcpServers": {
    "arra-oracle-v2": {
      "command": "bun",
      "args": ["run", "~/.local/share/arra-oracle-v2/src/index.ts"]
    }
  }
}
```

## Manual Installation

If you prefer step-by-step:

```bash
# 1. Clone
git clone https://github.com/Soul-Brews-Studio/arra-oracle-v2.git ~/.local/share/arra-oracle-v2
cd ~/.local/share/arra-oracle-v2

# 2. Install dependencies
bun install

# 3. Setup database
bun run db:push

# 4. Create seed data
./scripts/seed.sh

# 5. Index seed data
ORACLE_REPO_ROOT=~/.oracle/seed bun run index

# 6. Start server
bun run server
```

## Index Your Own Knowledge

To index your own ψ/memory files:

```bash
ORACLE_REPO_ROOT=/path/to/your/repo bun run index
```

The indexer scans:
- `ψ/memory/resonance/*.md` → principles
- `ψ/memory/learnings/*.md` → learnings
- `ψ/memory/retrospectives/**/*.md` → retrospectives

## Vector Search Setup

Oracle supports multiple vector backends. Configure via env vars:

### Option A: Qdrant Cloud + OpenAI (Recommended for Production)

Managed service, no local models needed, shared with my-ai-soul-mcp.

```bash
# Add to systemd service or .env
ORACLE_VECTOR_DB=qdrant
ORACLE_EMBEDDING_PROVIDER=openai
QDRANT_URL=https://your-cluster.cloud.qdrant.io
QDRANT_API_KEY=your-api-key
OPENAI_API_KEY=your-openai-key

# Index existing documents
source ~/.secrets/qdrant.env && source ~/.secrets/openai.env
export ORACLE_VECTOR_DB=qdrant ORACLE_EMBEDDING_PROVIDER=openai
bun src/scripts/index-model.ts bge-m3
```

### Option B: LanceDB + Ollama (Local Development)

Free, fully local, requires Ollama running with embedding models.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull bge-m3

# No env vars needed (defaults to lancedb + ollama)
bun src/scripts/index-model.ts bge-m3
```

### Option C: ChromaDB via uvx (Legacy)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# Restart server — auto-connects to ChromaDB
bun run server
```

Without any vector backend, Oracle falls back to FTS5-only search (still works).

## Troubleshooting

### Search returns 0 results after indexing

Server caches database state. Restart after indexing:
```bash
pkill -f 'bun.*server'
bun run server
```

### Indexer fails with ENOENT

Directory structure must be `ψ/memory/` not just `memory/`:
```bash
# Wrong
~/.oracle/seed/memory/resonance/

# Correct
~/.oracle/seed/ψ/memory/resonance/
```

### Vector search returns "Not Found"

Collection doesn't exist in Qdrant yet. Run the indexer:
```bash
bun src/scripts/index-model.ts bge-m3
```

### Vector search returns "model does not exist" (OpenAI)

The model registry is sending a local model name (bge-m3) to OpenAI instead of
text-embedding-3-small. Ensure `ORACLE_EMBEDDING_PROVIDER=openai` is set — the
factory will auto-map to the correct OpenAI model.

### systemd service uses wrong repo

Check `WorkingDirectory` in `~/.config/systemd/user/oracle-v2.service`. Must
point to `arra-oracle-v3` repo, not `oracle-v2`.

## Uninstall

```bash
rm -rf ~/.local/share/arra-oracle-v2
rm -rf ~/.oracle
```

## Remote MCP Access (Streamable HTTP)

Connect external MCP clients (Claude Desktop, ChatGPT, Codex, Gemini) to Oracle v3 via HTTPS.

### Server Setup

Set the auth token in your `.env`:

```bash
MCP_AUTH_TOKEN=your-secret-token-here
```

Restart the server — the startup banner will confirm: `🔑 MCP auth: configured`

### Client Configuration

Add to your MCP client settings (e.g., `~/.claude.json`):

```json
{
  "mcpServers": {
    "oracle-v3": {
      "type": "streamable-http",
      "url": "https://oracle.goko.digital/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-token-here"
      }
    }
  }
}
```

### Verify Connection

```bash
# Test auth rejection (no token)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:47778/mcp \
  -H "Content-Type: application/json" -d '{}'
# Expected: 401

# Test MCP initialize
curl -X POST http://localhost:47778/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token-here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
# Expected: JSON-RPC response with serverInfo

# Test tools/list (via HTTPS in production)
curl -X POST https://oracle.goko.digital/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
# Expected: 15+ arra_* tools
```

### Notes

- The `/mcp` endpoint uses **stateless mode** — each request is independent (no session tracking)
- Stdio transport (`src/index.ts`) is unchanged; local Claude Code installations continue to work
- nginx already configured with `proxy_buffering off` for SSE streaming

---

See also:
- [README.md](../README.md) - Overview
- [API.md](./API.md) - API documentation
- [architecture.md](./architecture.md) - System architecture
