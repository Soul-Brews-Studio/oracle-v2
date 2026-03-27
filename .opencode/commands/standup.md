---
description: "Daily standup - yesterday, today, blockers"
---

# /standup — Daily Standup

Quick daily status: what was done, what's planned, any blockers.

## Step 0: Timestamp
```bash
date "+🕐 %H:%M (%A %d %B %Y)"
```

## Gather Context

### 1. Yesterday's commits
```bash
git log --since="yesterday" --until="today" --oneline --author="$(git config user.name)" | head -10
```

### 2. Today's commits (so far)
```bash
git log --since="today" --oneline --author="$(git config user.name)" | head -10
```

### 3. Current WIP
```bash
cat ψ/WIP.md 2>/dev/null | head -20
```

### 4. Recent retrospectives
```bash
ls -t ψ/memory/retrospectives/$(date +%Y-%m)/*/*.md 2>/dev/null | head -3
```

## Output Format

```
🌅 Standup — [DATE]
═══════════════════════════════

## ✅ Yesterday
- [commit summaries or tasks done]

## 📋 Today
- [ ] [planned tasks from WIP.md]

## 🚧 Blockers
- [any blockers or none]

───────────────────────────────
```

## Notes

- Run at start of day
- Quick overview, not detailed retrospective
- Use `/rrr` for full session retrospective
- Pairs with `/wip` for current state
