---
description: "Show current work in progress (WIP.md)"
---

# /wip — Show Work in Progress

Read and display current work status from `ψ/WIP.md`.

## Step 0: Timestamp
```bash
date "+🕐 %H:%M (%A %d %B %Y)"
```

## Action

1. **Read WIP.md**:
   ```bash
   cat ψ/WIP.md 2>/dev/null || echo "No WIP.md found"
   ```

2. **Show focus** (if exists):
   ```bash
   cat ψ/inbox/focus.md 2>/dev/null
   ```

3. **Git status** (brief):
   ```bash
   git status --short
   ```

## Output

Display WIP content with current status:

```
📋 Work in Progress
─────────────────────
[WIP.md contents]

📍 Focus: [STATE] - [TASK]
📂 Git: [X files changed]
```

## Notes

- Quick way to resume work after break
- Pairs with `/forward` (write) and `/recap` (full context)
- Shows what's pending without full retrospective
