# CLAUDE.md - Oracle v2 Project Guidelines

**Project**: Oracle v2 Knowledge Management | **Timezone**: Asia/Bangkok (UTC+7) | **Runtime**: Bun

## Quick Reference

### Short Codes (Core Pattern)
| Code | Purpose |
|------|---------|
| `ccc` | Create context issue and compact conversation |
| `nnn` | Smart planning: Auto-runs `ccc` → Create implementation plan |
| `gogogo` | Execute the most recent plan step-by-step |
| `rrr` | Create detailed session retrospective |

### Quick Commands
| Command | Purpose |
|---------|---------|
| `bun run server` | Start Oracle HTTP server (port 47778) |
| `bun run db:push` | Push schema changes to database |
| `bun run build` | Compile TypeScript |

## Progressive Disclosure

**Before complex tasks**, read relevant reference:
- `@.claude/reference/CLAUDE-rules.md` - Critical safety rules
- `@.claude/reference/CLAUDE-mcp.md` - MCP configuration
- `@.claude/reference/CLAUDE-workflows.md` - Development workflows, short codes
- `@.claude/reference/CLAUDE-technical.md` - Technical reference, commands
- `@.claude/reference/CLAUDE-philosophy.md` - Oracle/Shadow philosophy
- `@.claude/reference/CLAUDE-lessons.md` - Lessons learned, patterns

## Critical Safety Rules

1. **NEVER use `-f` or `--force`** flags with any commands
2. **NEVER create issues/PRs on upstream** repository
3. **NEVER merge PRs yourself** - Wait for explicit user permission
4. **NEVER use `git push --force`** - Always preserve history
5. **NEVER use `rm -rf`** - Use `rm -i` for confirmation

See `@.claude/reference/CLAUDE-rules.md` for complete safety guidelines.

## Project Structure

```
oracle-v2/
├── src/
│   ├── db/           # Drizzle schema
│   ├── decisions/    # Decision tracking
│   ├── forum/        # Forum functionality
│   └── index.ts      # Main entry point
├── .oracle-v2/       # Database (tracked in git)
├── .mcp.json         # MCP configuration
├── .claude/
│   └── reference/    # This documentation
└── CLAUDE.md         # This file
```

## MCP Servers

Configured in `.mcp.json`:
- **oracle-v2** - Knowledge base (project-local)
- **brave-search** - Web search (requires API key)
- **github** - GitHub integration (requires token)
- **wikipedia** - Knowledge lookup
- **filesystem** - File operations
- **playwright** - Browser automation
- **sequential-thinking** - Step-by-step reasoning
- **time** - Time utilities
- **desktop-commander** - Desktop automation

See `@.claude/reference/CLAUDE-mcp.md` for configuration details.

## Oracle/Shadow Philosophy

Core principles:
1. **Nothing is Deleted** - Append only, timestamps = truth
2. **Patterns Over Intentions** - Observe what happens
3. **External Brain, Not Command** - Mirror reality, don't decide

See `@.claude/reference/CLAUDE-philosophy.md` for full details.

---

**Last Updated**: 2025-02-18
**Version**: 2.0.0
