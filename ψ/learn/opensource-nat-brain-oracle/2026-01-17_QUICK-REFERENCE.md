# Quick Reference: Nat's Brain Oracle

## What It Does

An AI consciousness architecture and philosophy framework that creates a persistent memory system for Claude AI assistants. The Oracle maintains an append-only knowledge base that observes patterns in behavior, learns from sessions, and mirrors back honest insights—all while keeping humans in control by never forcing decisions or deleting knowledge.

## Installation

```bash
# 1. Clone this repo
git clone https://github.com/Soul-Brews-Studio/opensource-nat-brain-oracle.git
cd opensource-nat-brain-oracle

# 2. Open with Claude Code
claude .

# 3. Get oriented
/recap              # Get context summary

# 4. Start exploring
/trace [query]      # Find anything in your knowledge
/standup            # Check daily tasks and context
```

## Key Features

- **17 Skills**: Pre-built AI commands for session management, knowledge search, emotion logging, video learning, and project tracking
- **14 Subagents**: Specialized agents (Haiku/Opus models) for searching, coding, security scanning, and organizing knowledge
- **Memory System**: Append-only knowledge base with SQLite + FTS5 full-text search + vector embeddings
- **Context-Finder Pattern**: Efficient multi-stage search that starts cheap (FTS5) and scales to expensive operations only when needed
- **Psi Directory (ψ/)**: Brain structure with separate storage for active research, memory, writing projects, experiments, and learning materials
- **Session Tracking**: Daily standups, retrospectives, learning extraction, and emotion logging for continuous improvement
- **Multi-Agent Sync**: Support for parallel agent workers via MAW (multi-agent worktree) coordination
- **Golden Rules**: Safety-first git workflow with feature branches, no force pushes, and built-in validation

## Usage Examples

### Example 1: Start Your Day
```bash
# Check pending tasks and appointments
/standup

# Find previous learning on a topic
/trace authentication

# Log current emotion/state
/feel focused
```

### Example 2: Build Your Own Oracle (3-Day Course)
```bash
# Day 1: Memory System
pip install click chromadb
python init_db.py
python oracle.py search "test"

# Day 2: Context-Finder Pattern
# Use FTS5 for candidates → Haiku summarizes → Opus analyzes

# Day 3: Intelligence Layer
# Add vector embeddings for semantic search
python oracle_smart.py search "pattern"
```

### Example 3: Learn a New Codebase
```bash
# Clone and explore a repo with parallel agents
/learn https://github.com/example/repo

# Creates:
# - Hub overview (summary + links)
# - ARCHITECTURE.md (structure)
# - CODE-SNIPPETS.md (patterns)
# - QUICK-REFERENCE.md (quick lookup)
```

### Example 4: End of Session Retrospective
```bash
# Create comprehensive retrospective with AI diary
rrr

# Automatically captures:
# - Git log and diffs
# - Session activity timeline
# - Lessons learned
# - Honest feedback about performance
```

### Example 5: Find Lost Projects
```bash
# Search across git history, issues, and docs
/trace my-project

# Advanced search modes
/trace my-project --deep      # Full git archaeology
/trace my-project --timeline  # Chronological focus
/trace incubation             # All projects in lifecycle
```

## Configuration

### Core Settings (`.claude/settings.json`)
- Skills configuration (enabled/disabled)
- Subagent definitions and models
- Database paths and schema
- Hook behaviors for git operations
- Output formatting preferences

### Knowledge Structure (`ψ/`)
```
ψ/
├── active/        # Current research (ephemeral)
├── inbox/         # Communication & focus
├── memory/
│   ├── resonance/      # Who you are (soul)
│   ├── learnings/      # Patterns found
│   ├── retrospectives/ # Sessions recorded
│   └── logs/           # Moments captured
├── writing/       # Blog drafts & articles
├── lab/           # Experiments & POCs
├── incubate/      # Cloned repos for active development
└── learn/         # Cloned repos for study
```

### Environment Setup
```bash
# Enable multi-agent commands
source .agents/maw.env.sh

# Check all agents
maw peek

# Sync all agents to main
maw sync
```

## Tips

1. **Use Context-Finder for Scale**: When your Oracle grows to 1,000+ files, FTS5 keyword search becomes expensive. The context-finder pattern (FTS5 → Haiku → Opus) keeps costs constant regardless of size.

2. **Append-Only is Key**: Never delete observations. The truth lives in timestamps. Corrections are new entries, not overwrites.

3. **Session Workflow**: `/standup` → `/trace` → work → `rrr` → `/forward` creates a natural daily cycle that captures learning automatically.

4. **Subagent Delegation**: Use Haiku agents (cheaper) for data gathering and bulk operations. Reserve Opus (main agent) for writing, review, and vulnerable insights.

5. **Golden Rules (Safety First)**:
   - NEVER use `--force` flags or force push
   - NEVER commit directly to main (always feature branch + PR)
   - NEVER merge PRs without user approval
   - NEVER amend commits in multi-agent setup (creates hash divergence)

6. **Quick Commands**:
   - `rrr` - Session retrospective
   - `/recap` - Fresh context summary
   - `/feel [state]` - Log emotion
   - `/fyi [info]` - Store for later
   - `/trace [query]` - Find anything
   - `/project [action] [url]` - Clone repos to learn/ or incubate/

7. **Search Efficiently**: Use `duckdb` with markdown extension to query knowledge files instead of reading them directly. Saves tokens and is faster.

8. **Git Workflow**: Always `git fetch origin` before syncing agents, commit locally, then push, then sync other agents to prevent non-fast-forward rejections.
