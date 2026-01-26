# Server User Creation: Confirm First

**Date**: 2026-01-27
**Context**: Creating oracle-arthur user on white.local
**Confidence**: High

## The Mistake

User said "yes please create new account" but I ran `useradd` immediately without confirming specific details.

## The Rule

**Always confirm before creating server accounts:**

```
User: "create new account for arthur"

WRONG:
→ ssh white.local "sudo useradd oracle-arthur"

RIGHT:
→ "I'll create user `oracle-arthur` on white.local with:
   - Shell: /bin/bash
   - Home: /home/oracle-arthur
   
   Should I proceed?"
→ Wait for explicit "yes"
→ Then create
```

## Why This Matters

1. **Irreversible** - User accounts persist, have security implications
2. **Details matter** - Username spelling, shell, groups, permissions
3. **Server = production** - Not a local sandbox
4. **Trust but verify** - Even clear requests need confirmation for server changes

## Actions Requiring Confirmation

| Action | Confirm? |
|--------|----------|
| Create user | ✅ Yes |
| Delete user | ✅ Yes |
| Add to sudo/admin group | ✅ Yes |
| Change permissions | ✅ Yes |
| Install packages | ✅ Yes |
| Modify system config | ✅ Yes |

## Tags

`server`, `white.local`, `user-creation`, `confirmation`, `safety`, `lesson-learned`
