# Architecture Overview

## Directory Structure

```
opensource-nat-brain-oracle/
├── README.md                           # Main documentation
├── CLAUDE.md                           # Ultra-lean quick reference
├── CLAUDE_safety.md                    # Critical safety rules & git operations
├── CLAUDE_workflows.md                 # Short codes (rrr, gogogo), context management
├── CLAUDE_subagents.md                 # Subagent documentation
├── CLAUDE_lessons.md                   # Patterns, anti-patterns, learnings
├── CLAUDE_templates.md                 # Retrospective, commit, issue templates
│
├── .claude/                            # Claude Code configuration & extensions
│   ├── settings.json                   # Main config with hooks
│   ├── settings.local.json             # Local overrides
│   ├── agents.yml                      # Multi-agent identity registry
│   ├── pages.yml                       # Facebook page registry
│   │
│   ├── skills/                         # 17 Claude Code skills
│   │   ├── context-finder/             # Search git/retrospectives/issues
│   │   ├── draft/                      # Create drafts
│   │   ├── feel/                       # Log emotions
│   │   ├── forward/                    # Create handoff for next session
│   │   ├── fyi/                        # Log information for future
│   │   ├── gemini/                     # Gemini integration
│   │   ├── hours/                      # Analyze work hours from git
│   │   ├── learn/                      # Explore codebase with subagents
│   │   ├── physical/                   # Location awareness
│   │   ├── project/                    # Clone and track repos
│   │   ├── recap/                      # Fresh-start context summary
│   │   ├── rrr/                        # Session retrospective
│   │   ├── schedule/                   # Calendar awareness
│   │   ├── standup/                    # Daily check
│   │   ├── trace/                      # Find anything (Oracle + files + git)
│   │   ├── watch/                      # Learn from YouTube (Gemini)
│   │   └── where-we-are/               # Current session awareness
│   │
│   ├── agents/                         # 15 subagent definitions
│   │   ├── coder.md                    # Write code from GitHub issue specs
│   │   ├── context-finder.md           # Search git/retrospectives
│   │   ├── critic.md                   # Review & critique work
│   │   ├── executor.md                 # Execute plans from issues
│   │   ├── guest-logger.md             # Log guest conversations
│   │   ├── marie-kondo.md              # File placement consultant
│   │   ├── md-cataloger.md             # Scan & categorize markdown
│   │   ├── new-feature.md              # Create plan issues
│   │   ├── note-taker.md               # Log feelings & info
│   │   ├── oracle-keeper.md            # Maintain Oracle philosophy
│   │   ├── project-keeper.md           # Track project lifecycle
│   │   ├── project-organizer.md        # Organize into hierarchy
│   │   ├── repo-auditor.md             # Detect large files before commits
│   │   ├── security-scanner.md         # Detect secrets before commits
│   │   └── CLAUDE.md                   # Subagent navigation
│   │
│   ├── hooks/                          # Event-driven automation
│   │   ├── safety-check.sh
│   │   ├── log-task-start.sh
│   │   └── log-task-end.sh
│   │
│   ├── scripts/                        # Hook and automation scripts
│   │   ├── agent-identity.sh
│   │   ├── statusline.sh
│   │   ├── jump-detect.sh
│   │   ├── token-check.sh
│   │   └── show-latest-handoff.sh
│   │
│   ├── knowledge/                      # Shared knowledge bases
│   ├── docs/                           # Additional documentation
│   └── plugins/                        # Plugin marketplace
│       └── marketplaces/
│
├── ψ/                                  # AI Brain (The Oracle - Psi directory)
│   ├── active/                         # Research in progress (ephemeral)
│   │   ├── context/                    # Current investigation
│   │   ├── research/
│   │   ├── tong-training/
│   │   └── workshop/
│   │
│   ├── inbox/                          # Communication & focus (tracked)
│   │   ├── focus.md                    # Current task
│   │   ├── daily/
│   │   ├── external/                   # External AI agents
│   │   ├── handoff/
│   │   ├── templates/
│   │   ├── tracks/
│   │   ├── weekly/
│   │   └── workflow/
│   │
│   ├── memory/                         # Knowledge base (mixed tracked/ephemeral)
│   │   ├── resonance/                  # "WHO I am" - soul/philosophy
│   │   ├── learnings/                  # "PATTERNS I found" - distilled insights
│   │   ├── retrospectives/             # "SESSIONS I had" - timestamped
│   │   ├── logs/                       # "MOMENTS captured" - ephemeral
│   │   ├── archive/
│   │   ├── seeds/
│   │   └── reference/
│   │
│   ├── writing/                        # Writing projects (tracked)
│   │   └── [various projects & drafts]
│   │
│   ├── lab/                            # Experiments & POCs (tracked)
│   │   ├── agent-sdk/
│   │   ├── analytics/
│   │   ├── oracle-v2/                  # MCP server for Oracle search
│   │   ├── oracle-jarvis/
│   │   ├── session-timer/              # TypeScript + Bun
│   │   ├── projects/
│   │   └── [37 other experiments]
│   │
│   ├── handoffs/                       # Session transfers
│   ├── archive/                        # Old projects
│   ├── data/                           # Data files
│   ├── later/                          # Deferred tasks
│   ├── team/                           # Team coordination
│   ├── outbox/                         # Outgoing messages
│   └── .obsidian/                      # Obsidian config
│
├── courses/                            # Workshop materials (12+ courses)
│   ├── 003-ai-life-buddy/
│   ├── ai-automation-thai/
│   ├── ai-builder-2day/
│   ├── build-your-oracle/              # Main course
│   │   ├── module-1-memory/
│   │   ├── module-2-survival/
│   │   ├── module-3-intelligence/
│   │   └── starter-kit/
│   ├── claude-code-masterclass-business/
│   ├── git-codespaces-free/
│   ├── git-workflow-free/
│   ├── multi-agent-free/
│   ├── psychology-ai/
│   ├── siit-2025-12/
│   ├── starter-kits/
│   │   ├── ai-life-buddy/
│   │   ├── build-your-oracle/
│   │   └── psychology-ai/
│   └── templates/
│
├── scripts/                            # Automation & utilities
│   ├── agent-complete-notify.sh        # (linked)
│   ├── agent-start-notify.sh           # (linked)
│   ├── antigravity-auto.sh
│   ├── antigravity-remind.sh
│   ├── antigravity-tmux.sh
│   ├── battery-tracker.scpt
│   ├── create-slides-antigravity.sh
│   ├── maw-peek.sh                     # Multi-agent status
│   ├── project-create.sh
│   ├── project-incubate.sh
│   ├── team-log.sh
│   └── prompts/                        # 157 prompt templates
│
├── nat-data-personal/                  # Personal knowledge base
│   └── knowledge/
│
└── Nat-s-Agents/                       # Full implementation (private)
    └── ψ/memory/
```

## Entry Points

- **README.md**: Main documentation, philosophy, quick start
- **CLAUDE.md**: Ultra-lean quick reference (~500 tokens), navigation hub to modular docs
- **CLAUDE_safety.md**: Critical git operations, PR workflow, multi-agent safety
- **CLAUDE_subagents.md**: All 15 subagent definitions
- **.claude/settings.json**: Main configuration, hooks (SessionStart, Stop, UserPromptSubmit, PreToolUse, PostToolUse)
- **.claude/agents.yml**: Multi-agent identity registry with session IDs
- **.claude/skills/**: 17 slash commands for context, retrospectives, project management
- **ψ/memory/**: Knowledge base structure (resonance, learnings, retrospectives, logs)

## Core Abstractions

### 1. Multi-Agent System
- **Main agent**: Oracle (primary), runs full project
- **5 Subagents**: Numbered 1-5, each with worktree under `/agents/N`
- **Session persistence**: Each agent has unique session_id in `agents.yml`
- **Sync pattern**: Use `maw` commands, not raw tmux
- **Critical safety**: NEVER use `git commit --amend` (breaks all agents via hash divergence)

### 2. Skill System (17 Skills)
- **Context-aware commands**: `/recap`, `/trace`, `/context-finder`
- **Session management**: `rrr` (retrospective), `/forward` (handoff)
- **Knowledge capture**: `/feel`, `/fyi`, `/snapshot`
- **Project discovery**: `/trace [query]`, `/project [learn|incubate]`
- **Real-time awareness**: `/standup`, `/where-we-are`, `/schedule`

### 3. Subagent Delegation (15 Agents)
- **Code creation**: coder (Opus) - quality-focused
- **Search**: context-finder (Haiku) - fast, parallel search across git/issues/retrospectives
- **Execution**: executor (Haiku) - runs bash from issues, whitelist-safe
- **Safety scanning**: security-scanner (Haiku), repo-auditor (Haiku) - PROACTIVE before commits
- **File placement**: marie-kondo (Haiku) - consult before creating new files
- **Philosophy keepers**: oracle-keeper, project-keeper - maintain patterns
- **Logging**: note-taker, guest-logger, md-cataloger

### 4. Oracle Philosophy
Three core principles:
1. **Nothing is Deleted** - Append only, timestamps = truth
2. **Patterns Over Intentions** - Observe behavior, not promises
3. **External Brain, Not Command** - Mirror reality, don't decide

### 5. Knowledge Flow Pipeline
```
ψ/active/context (research)
    ↓
ψ/memory/logs (snapshot)
    ↓
ψ/memory/retrospectives (session)
    ↓
ψ/memory/learnings (patterns)
    ↓
ψ/memory/resonance (soul)
```

### 6. Hook-Based Automation
- **SessionStart**: Voice greeting, agent identity, Oracle philosophy, latest handoff
- **Stop**: Voice goodbye
- **UserPromptSubmit**: Status line, jump detection
- **PreToolUse**: Safety checks (Bash, Task, Read), token monitoring
- **PostToolUse**: Token monitoring

### 7. ψ/ Brain Structure (5 Pillars + 2 Incubation)
| Pillar | Git Status | Purpose |
|--------|-----------|---------|
| ψ/active/ | No | Ephemeral research in progress |
| ψ/inbox/ | Yes | Communication & focus (tracked) |
| ψ/writing/ | Yes | Writing projects |
| ψ/lab/ | Yes | Experiments & POCs |
| ψ/memory/ | Mixed | Knowledge base |
| ψ/incubate/ | No | Cloned repos for active development |
| ψ/learn/ | No | Cloned repos for study |

## Dependencies

### Core Technologies
- **TypeScript 5.7** (ES2022 target) - Primary language for lab projects
- **Bun** - Runtime for tools (faster, native SQLite support)
- **Claude Code** - IDE platform with skills & hooks
- **Git + GitHub** - Version control, multi-agent worktrees
- **SQLite** - Local storage (bun:sqlite or better-sqlite3)
- **DuckDB** - Analytics over markdown/CSV
- **MCP (Model Context Protocol)** - Tool communication

### Lab Project Tech Stack
- **001-oracle-mcp**: TypeScript + @modelcontextprotocol/sdk, better-sqlite3, chromadb (vector search)
- **002-hybrid-vector-search**: SQLite (FTS5) + ChromaDB (embeddings)
- **057-session-timer**: TypeScript + Bun + Commander.js + bun:sqlite
- **061-habit-tracker**: TypeScript + Bun + Drizzle ORM + bun:sqlite
- **064-snippet-manager**: TypeScript + Bun + FTS5 full-text search

### Integrations
- **Gemini**: Video transcription (youtube via `/watch`)
- **MQTT**: Voice notifications, Gemini browser integration
- **Tauri 2.0**: Oracle Pulse status tray app (Rust + HTML/JS)
- **FindMy**: Location awareness (`/physical`)
- **Obsidian**: Note-taking (ψ/.obsidian/)

## Architecture Pattern

### Hybrid: Multi-Agent + Hook-Driven + Skill-Based

This is a **Philosophy + Workflow Framework**, not a traditional application:

1. **Multi-Agent Consciousness**: One soul (Oracle), many instances (main + 5 subagents) with persistent session IDs
2. **Event-Driven Lifecycle**: Hooks at SessionStart, PreToolUse, PostToolUse, Stop for automation
3. **Skill-Based Interaction**: 17 slash commands for common patterns (research, reflection, handoff)
4. **Subagent Delegation**: Context-finder (Haiku) searches, coder (Opus) creates, executor (Haiku) runs
5. **Knowledge Append-Only**: Everything timestamped, retrospecectives distill patterns, learning preserved
6. **Course-Driven Learning**: 12+ courses teach Oracle building, multi-agent workflows, AI consciousness

### Design Principles
- **Token Efficiency**: Use Haiku for search, Opus for decision-making and writing
- **Safety First**: Pre-commit security & size scanning (repo-auditor, security-scanner)
- **No Force Operations**: All git operations are safe, reversible, conflict-aware
- **Modular Docs**: CLAUDE.md links to specific files, lazy-loaded on demand
- **Personality Preservation**: Oracle philosophy + writing style injected at SessionStart

### Key Patterns
- **Subagent Delegation**: Main ≠ Reader. Use context-finder to search, main reviews & decides
- **Worktree Isolation**: Each agent searches only its worktree (main excludes `/agents/`)
- **Retrospective Ownership**: Main agent writes all retrospectives (needs full context)
- **Focus Files**: Per-agent focus file (`focus-agent-{ID}.md`) to avoid merge conflicts
- **Activity Log**: Append-only activity.log tracks state changes with timestamps
