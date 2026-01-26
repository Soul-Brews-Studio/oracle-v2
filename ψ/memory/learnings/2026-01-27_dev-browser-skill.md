# Dev-Browser: Persistent Browser Automation Skill

**Date**: 2026-01-27
**Context**: Viewing Dagster UI with AI-controlled browser
**Confidence**: High

## Key Learning

`dev-browser` is a Claude Code skill (not MCP tool) that provides **persistent browser automation** via Playwright. Unlike traditional browser tools that reset state each time, dev-browser keeps pages alive on a stateful server.

Key advantages over `mcp__claude-in-chrome`:
1. **Persistent pages** - Navigate once, interact many times
2. **Named pages** - `client.page("dagster")` remembers state
3. **ARIA snapshots** - AI-friendly element discovery with refs
4. **Works reliably** - No flaky browser extension connection

## Installation

```bash
/plugin marketplace add sawyerhood/dev-browser
/plugin install dev-browser@sawyerhood/dev-browser
```

## Usage Pattern

```typescript
cd skills/dev-browser && npx tsx <<'EOF'
import { connect, waitForPageLoad } from "./src/client.js";

const client = await connect();
const page = await client.page("my-page", { viewport: { width: 1280, height: 800 } });

await page.goto("http://localhost:3005");
await waitForPageLoad(page);
await page.screenshot({ path: "tmp/screenshot.png" });

await client.disconnect();  // Page stays alive!
EOF
```

## Gotchas

1. **Start server first**: `npm run start-server` in the skill directory
2. **Set viewport**: Prevents "0 width" screenshot errors
3. **Pages persist**: Same name = same page across scripts
4. **Plain JS only**: No TypeScript in `page.evaluate()` callbacks

## Why This Matters

When `mcp__claude-in-chrome` fails to connect (common), dev-browser provides a reliable alternative. It's faster and more consistent for automated browser tasks.

## Tags

`browser-automation`, `dev-browser`, `playwright`, `claude-code-skill`
