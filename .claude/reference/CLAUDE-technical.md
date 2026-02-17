# CLAUDE Technical - Project-Specific Reference

## Project: Oracle v2

### Project Overview
Knowledge management system implementing the Oracle/Shadow philosophy - a personal knowledge base with MCP integration for storing and retrieving wisdom, principles, patterns, and learnings.

### Architecture

**Backend**:
- **Runtime**: Bun (JavaScript/TypeScript)
- **Framework**: Hono (HTTP server)
- **Database**: SQLite with Drizzle ORM
- **Language**: TypeScript

**Frontend** (if applicable):
- React with Vite (for dashboard)

**Key Dependencies**:
- `drizzle-orm` - Database ORM
- `hono` - Web framework
- `@types/` - TypeScript definitions

## Development Environment

### Environment Variables

#### Database (Auto-configured)
```bash
ORACLE_DB_PATH=${projectRoot}/.oracle-v2/oracle.db
ORACLE_DATA_DIR=${projectRoot}/.oracle-v2
```

#### MCP API Keys (in .mcp.json)
```bash
BRAVE_API_KEY=your-key-here
GITHUB_TOKEN=your-token-here
```

### Development Ports

| Service | Port | Command |
|---------|------|---------|
| Oracle HTTP Server | `47778` | `bun run server` |

### Available Commands

#### Development
```bash
# Start Oracle server
bun run server              # http://localhost:47778

# Database operations
bun run db:push             # Push schema changes to database
bun run db:studio           # Open Drizzle Studio (if configured)

# Build
bun run build               # Compile TypeScript
```

#### Git & GitHub
```bash
# Safe git operations only
git status
git add -A
git commit -m "message"
git push origin branch

# GitHub CLI
gh issue create
gh pr create
```

#### Search & Analysis
```bash
# Ripgrep (preferred)
rg "pattern" --type ts

# Find files
fd "pattern"
```

## Code Standards

- Follow TypeScript best practices
- Enable strict mode and linting
- Write clear, self-documenting code
- Avoid `any` types - use proper TypeScript typing
- Use Drizzle ORM patterns: `.returning().all()` instead of `.run().lastInsertRowid`

## Git Commit Format

```
[type]: [brief description]

- What: [specific changes]
- Why: [motivation]
- Impact: [affected areas]

Closes #[issue-number]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Error Handling Patterns

- Use `try/catch` blocks for operations that might fail
- Provide descriptive error messages
- Implement graceful fallbacks
- Use null coalescing `??` for optional database fields
- Use type assertions for JSON responses when needed

## Troubleshooting

### Build Failures
```bash
# Check for type errors
bun run build 2>&1 | grep -A 5 "error"

# Clear cache and reinstall
rm -rf node_modules .cache dist
bun install
```

### Database Issues
```bash
# Reset database (CAUTION: deletes data)
rm .oracle-v2/oracle.db
bun run db:push

# Check schema
rg "export.*=" src/db/schema.ts
```

### Port Conflicts
```bash
# Find process using port
lsof -i :47778

# Kill process
kill -9 [PID]
```
