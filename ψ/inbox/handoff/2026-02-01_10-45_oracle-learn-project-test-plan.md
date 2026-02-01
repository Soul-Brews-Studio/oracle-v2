# Handoff: oracle_learn Project Arg Test Plan

**Date**: 2026-02-01 10:45 GMT+7
**For**: Next session
**Context**: Testing oracle_learn project normalization fix

---

## Pre-Test Setup

```bash
# 1. Kill any running MCP
pkill -f "oracle-v2/src/index"

# 2. Verify symlink is correct
ls -la ~/Code/github.com/laris-co/oracle-v2
# Should show: laris-co/oracle-v2 -> Soul-Brews-Studio/oracle-v2

# 3. Reconnect MCP
/mcp
```

---

## Test Cases

### Test 1: Short format (owner/repo)

```typescript
oracle_learn({
  pattern: "Test 1: Short format normalization",
  project: "laris-co/Nat-s-Agents"
})
```

**Expected**: `project = github.com/laris-co/Nat-s-Agents`

### Test 2: Already normalized

```typescript
oracle_learn({
  pattern: "Test 2: Already normalized",
  project: "github.com/Soul-Brews-Studio/oracle-v2"
})
```

**Expected**: `project = github.com/Soul-Brews-Studio/oracle-v2`

### Test 3: GitHub URL

```typescript
oracle_learn({
  pattern: "Test 3: GitHub URL normalization",
  project: "https://github.com/laris-co/Nat-s-Agents"
})
```

**Expected**: `project = github.com/laris-co/Nat-s-Agents`

### Test 4: Local path

```typescript
oracle_learn({
  pattern: "Test 4: Local path normalization",
  project: "~/Code/github.com/laris-co/Nat-s-Agents"
})
```

**Expected**: `project = github.com/laris-co/Nat-s-Agents`

### Test 5: No project (fallback)

```typescript
oracle_learn({
  pattern: "Test 5: No project - should fallback to local detection"
})
```

**Expected**: `project = github.com/Soul-Brews-Studio/oracle-v2` (from MCP cwd)

### Test 6: Parse from source

```typescript
oracle_learn({
  pattern: "Test 6: Parse from source field",
  source: "oracle_learn from github.com/laris-co/shrimp-oracle"
})
```

**Expected**: `project = github.com/laris-co/shrimp-oracle`

---

## Verification

### Option 1: HTTP API (preferred)

```bash
# Get doc by ID - returns project field
curl -s "http://localhost:47778/api/doc/learning_2026-02-01_test-1-short-format-normalization" | jq .project
# Expected: "github.com/laris-co/Nat-s-Agents"
```

### Option 2: Oracle MCP

```typescript
oracle_search({ query: "Test 1", limit: 1 })
// Check project field in result
```

### Option 3: UI

http://localhost:3000/learnings
- Click on test doc
- Verify repo link shows correct project
- Verify "View on GitHub" link works

---

## Cleanup

After testing:

```bash
# Delete test docs
rm -f ψ/memory/learnings/2026-02-*_test-*.md

# Reindex to clean DB
bun run src/indexer.ts
```

---

## Success Criteria

- [ ] All 6 test cases pass
- [ ] UI shows correct project links
- [ ] "View on GitHub" links work
- [ ] No "file not found" for local docs

---

## If Tests Fail

1. Check MCP is running from correct path:
   ```bash
   ps aux | grep oracle-v2/src/index
   ```

2. Verify symlink:
   ```bash
   ls -la ~/Code/github.com/laris-co/oracle-v2
   ```

3. Check src/index.ts has the fix:
   ```bash
   grep "normalizeProject" src/index.ts
   ```

---

*Ready for next session*
