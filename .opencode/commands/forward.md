---
description: "Forward context to new session (use before /clear)"
---

# /forward — ส่งต่องานให้ session ใหม่

> ใช้ก่อน /clear — เตรียม context สำหรับเริ่มใหม่

## Flow

```
/forward → /clear → session ใหม่อ่าน WIP.md
```

**ไม่ใช่ /compact** — /forward = เริ่มใหม่ fresh

## Step 0: Timestamp
```bash
date "+🕐 %H:%M (%A %d %B %Y)"
```

## Steps

1. **Git Status**:
   ```bash
   git status --short
   ```

2. **งานค้าง** — ลิสต์สั้นๆ

3. **Context** — 1-3 บรรทัดที่ session ใหม่ต้องรู้

4. **เขียน** `ψ/WIP.md`

## Template

```markdown
# WIP — [DATE] [TIME]

## Git Status
```
[raw output]
```

## งานค้าง
- [ ] ...

## Context
- ...
```

## After /forward

```
User: /clear
[fresh session starts]
User: /recap
[AI reads WIP.md → continues work]
```

## Rules

- **Simple** — ใช้ context น้อย
- **Fresh start** — ไม่ใช่ compact
- **WIP.md** — พร้อมสำหรับ session ใหม่
