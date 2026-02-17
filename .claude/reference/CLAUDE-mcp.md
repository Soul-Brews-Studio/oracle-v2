# CLAUDE MCP - Model Context Protocol Configuration

## Overview

This project uses MCP (Model Context Protocol) servers to extend AI capabilities. All configuration is in `.mcp.json` at the project root.

## Dynamic Path Variables

- `${projectRoot}` - Resolves to the project directory (`/home/user/WORK/projects/oracle-v2`)
- `${env:HOME}` - Resolves to user's home directory

## Configured Servers

### oracle-v2 (Project-local)
```json
{
  "description": "Oracle v2 - Knowledge base with principles, patterns, learnings",
  "command": "bun",
  "args": ["run", "src/index.ts"],
  "cwd": "${projectRoot}",
  "env": {
    "ORACLE_DB_PATH": "${projectRoot}/.oracle-v2/oracle.db",
    "ORACLE_DATA_DIR": "${projectRoot}/.oracle-v2"
  }
}
```
**Purpose**: Knowledge management system for storing and retrieving wisdom, principles, and patterns.

### brave-search (Requires API Key)
```json
{
  "description": "Brave Search API - Web search",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-brave-search"],
  "env": {
    "BRAVE_API_KEY": "your-brave-search-api-key-here"
  }
}
```
**Purpose**: Web search using Brave Search API.
**Get API Key**: https://api.search.brave.com/app/keys

### github (Requires Token)
```json
{
  "description": "GitHub integration - issues, PRs, repositories",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_TOKEN": "your-github-personal-access-token-here"
  }
}
```
**Purpose**: Interact with GitHub - create issues, PRs, manage repositories.
**Get Token**: https://github.com/settings/tokens

### wikipedia
```json
{
  "description": "Wikipedia search - for knowledge lookup",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-wikipedia"]
}
```
**Purpose**: Search Wikipedia for factual information.

### filesystem
```json
{
  "description": "File system access - read, write, search files",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "${projectRoot}"]
}
```
**Purpose**: Read, write, and search files within the project directory.

### desktop-commander
```json
{
  "description": "Desktop automation - file operations, process management",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-desktop-commander"]
}
```
**Purpose**: Desktop automation - file operations, process management.

### playwright
```json
{
  "description": "Browser automation - screenshots, interaction",
  "command": "npx",
  "args": ["-y", "@executeautomation/playwright-mcp-server"]
}
```
**Purpose**: Browser automation - screenshots, web interaction.

### sequential-thinking
```json
{
  "description": "Sequential thinking - step-by-step reasoning",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
}
```
**Purpose**: Step-by-step reasoning for complex problems.

### time
```json
{
  "description": "Time utilities - current time, timezone conversion",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-time"]
}
```
**Purpose**: Get current time and convert timezones.

## Adding Custom MCP Servers

For project-local MCP servers (not available via npx):

```bash
# Clone to .claude/server/
git clone [repo-url] .claude/server/[name]
cd .claude/server/[name] && bun install
```

Then add to `.mcp.json`:
```json
{
  "your-server": {
    "command": "node",
    "args": ["${projectRoot}/.claude/server/your-server/index.js"]
  }
}
```

## Portability Notes

- All paths use `${projectRoot}` for portability
- Database is tracked at `.oracle-v2/oracle.db`
- node_modules is included for true portability
- Move folder to any machine and it works immediately
