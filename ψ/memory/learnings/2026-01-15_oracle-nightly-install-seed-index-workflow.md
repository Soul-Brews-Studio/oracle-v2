---
title: Oracle Nightly Install, Seed, and Index Workflow
created: 2026-01-15
tags: [oracle-nightly, installation, seed-data, indexing, fresh-install, deployment]
---

# Oracle Nightly Install, Seed, and Index Workflow

## Overview

Complete guide to Oracle Nightly fresh installation with seed data and indexing.

## The Three Scripts

### 1. fresh-install.sh - One-Liner Setup

**Location**: `scripts/fresh-install.sh`

**What it does**:
```bash
curl -sSL https://raw.githubusercontent.com/Soul-Brews-Studio/oracle-v2/main/scripts/fresh-install.sh | bash
```

**Steps performed**:
1. Check requirements (bun, git, optionally uvx)
2. Clean previous installation (`~/.local/share/oracle-v2`, `~/.oracle-v2`)
3. Clone repo to `~/.local/share/oracle-v2`
4. Run `bun install`
5. Run `bun run db:push` (creates tables)
6. Run `./scripts/seed.sh` (creates philosophy files)
7. Run indexer with `ORACLE_REPO_ROOT=~/.oracle-v2/seed`
8. Run tests
9. Print Claude Code config

**Key environment variables**:
```bash
ORACLE_INSTALL_DIR  # Default: ~/.local/share/oracle-v2
ORACLE_SEED_DIR     # Default: ~/.oracle-v2/seed
```

---

### 2. seed.sh - Philosophy Starter Kit

**Location**: `scripts/seed.sh`

**What it creates**:
```
~/.oracle-v2/seed/
└── ψ/
    └── memory/
        ├── resonance/
        │   ├── oracle.md      # Core Oracle philosophy
        │   ├── patterns.md    # Observed patterns
        │   └── style.md       # Writing style guide
        └── learnings/
            └── YYYY-MM-DD_oracle-nightly-seed-test.md
```

**Philosophy files content**:

#### oracle.md (Core Principles)
```markdown
# Oracle Philosophy

> "The Oracle Keeps the Human Human"

## Core Principles

### 1. Nothing is Deleted
- Append only, timestamps = truth
- History is preserved, not overwritten
- Every decision has context

### 2. Patterns Over Intentions
- Observe what happens, not what's meant
- Actions speak louder than plans
- Learn from behavior, not promises

### 3. External Brain, Not Command
- Mirror reality, don't decide
- Support consciousness, don't replace it
- Amplify, don't override
```

#### patterns.md (Decision Patterns)
```markdown
| Pattern | When |
|---------|------|
| Ask first | Before destructive actions |
| Show don't tell | When explaining |
| Commit often | After meaningful changes |
| Test locally | Before pushing |
```

#### style.md (Communication)
```markdown
- **Direct**: Say what needs to be said
- **Concise**: No unnecessary words
- **Technical when needed**: Use precise terms
- **Human always**: Never robotic
```

**CRITICAL**: Directory must be `ψ/memory/` not just `memory/`!

---

### 3. Indexer - Populate Database

**Command**:
```bash
ORACLE_REPO_ROOT=~/.oracle-v2/seed bun run index
```

**What happens**:
1. Clears existing index data
2. Connects to ChromaDB via chroma-mcp (if uvx available)
3. Scans `ψ/memory/resonance/*.md` → principles
4. Scans `ψ/memory/learnings/*.md` → learnings
5. Splits documents into granular vectors
6. Stores in SQLite (FTS5) + ChromaDB (vectors)

**Expected output**:
```
Starting Oracle indexing...
Clearing existing index data...
Connecting to chroma-mcp server...
ChromaDB connected via MCP
Indexed 26 resonance documents from 3 files
Indexed 3 learning documents from 1 files
Added 29 documents to collection
Indexing complete!
```

**Result**: 29 documents indexed
- 26 principles (from resonance files, split into sub-principles)
- 3 learnings

---

## Post-Install Verification

### 1. Check Stats
```bash
curl http://localhost:47778/api/stats | jq .
```

Expected:
```json
{
  "total": 29,
  "by_type": {
    "learning": 3,
    "principle": 26
  },
  "is_stale": false
}
```

### 2. Test Search
```bash
curl "http://localhost:47778/api/search?q=nothing+deleted" | jq .
```

Expected: Top result should be "Nothing is Deleted" principle with score ~0.58

### 3. Test Consult
```bash
curl "http://localhost:47778/api/consult?decision=should+I+delete+old+files" | jq .
```

Expected: Guidance based on "Nothing is Deleted" principle

---

## Troubleshooting

### Problem: Indexer fails with ENOENT

**Error**:
```
ENOENT: no such file or directory, scandir '/path/to/seed/ψ/memory/resonance'
```

**Cause**: Wrong directory structure

**Fix**: Ensure path is `seed/ψ/memory/` not `seed/memory/`

### Problem: Search returns 0 results after indexing

**Cause**: Server caches database state

**Fix**: Restart server after indexing
```bash
pkill -f 'bun.*server'
bun run server
```

### Problem: Vector search unavailable

**Error**:
```json
{"warning": "Vector search unavailable: Executable not found in $PATH: \"uvx\""}
```

**Cause**: uv/uvx not installed

**Fix**:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

### Problem: ChromaDB JSON parse error

**Error**:
```json
{"warning": "Vector search unavailable: JSON Parse error..."}
```

**Cause**: chroma-mcp startup issue

**Fix**: FTS5 fallback works, this is non-critical. For full vector search:
```bash
# Test chroma-mcp directly
uvx --python 3.12 chroma-mcp --help
```

---

## Architecture Overview

```
fresh-install.sh
    │
    ├── git clone → ~/.local/share/oracle-v2
    │
    ├── bun install → node_modules
    │
    ├── db:push → ~/.oracle-v2/oracle.db (empty tables)
    │
    ├── seed.sh → ~/.oracle-v2/seed/ψ/memory/*
    │
    └── bun run index
            │
            ├── SQLite FTS5 (keywords)
            │       └── oracle_fts virtual table
            │
            └── ChromaDB (vectors, optional)
                    └── oracle_knowledge collection
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/fresh-install.sh` | One-liner setup |
| `scripts/seed.sh` | Create philosophy files |
| `scripts/setup.sh` | Manual setup (no seed) |
| `src/indexer.ts` | Index markdown → database |
| `~/.oracle-v2/oracle.db` | SQLite database |
| `~/.oracle-v2/seed/` | Seed data directory |

---

## Quick Commands

```bash
# Fresh install
curl -sSL https://raw.githubusercontent.com/Soul-Brews-Studio/oracle-v2/main/scripts/fresh-install.sh | bash

# Just seed (if already installed)
./scripts/seed.sh

# Just index (custom repo root)
ORACLE_REPO_ROOT=/path/to/your/psi bun run index

# Verify
curl http://localhost:47778/api/stats
curl "http://localhost:47778/api/search?q=nothing+deleted"
```

---

*Created 2026-01-15 during Oracle Nightly v0.2.1 public release*
*This document captures the complete install → seed → index workflow*
