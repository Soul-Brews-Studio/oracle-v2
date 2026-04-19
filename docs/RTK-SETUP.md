# RTK (Rust Token Killer) — Claude Code Setup

RTK is a CLI proxy that compresses command output before it reaches the LLM context. On typical dev commands (`git status`, `ls`, `grep`, `diff`, etc.) it cuts 60–90% of the tokens without losing actionable signal.

- Upstream: <https://github.com/notwithering/rtk> (name collision warning: not the `reachingforthejack/rtk` Rust Type Kit)
- Installed binary: `/home/nat/.local/bin/rtk`
- Tested version: **rtk 0.37.1**

## How it plugs into Claude Code

`rtk init -g` adds a `PreToolUse` hook that matches `Bash` tool calls and pipes them through `rtk hook claude`. The hook rewrites recognizable commands (e.g. `git status` → `rtk git status`) transparently — Claude does not change how it calls Bash.

### What `rtk init -g` modifies

Three changes to `~/.claude/` (user-global — **not** committed to this repo):

1. **`~/.claude/settings.json`** — appends a `Bash`-matcher entry to `hooks.PreToolUse`:

   ```json
   {
     "matcher": "Bash",
     "hooks": [
       { "type": "command", "command": "rtk hook claude" }
     ]
   }
   ```

   A backup is written to `~/.claude/settings.json.bak`.

2. **`~/.claude/RTK.md`** — short instruction file describing meta-commands (`rtk gain`, `rtk discover`, `rtk proxy`).

3. **`~/.claude/CLAUDE.md`** — a trailing `@RTK.md` reference is appended so the instruction file is loaded into every session.

A user-global filter template is also written to `~/.config/rtk/filters.toml` (edit to add custom filters).

## Verifying it works

```bash
rtk --version          # rtk 0.37.1
rtk git status         # compressed output (symbols instead of verbose English)
rtk gain               # savings summary — shows per-command counts and %
```

Example from a live run in this repo: `rtk git status` saved **44.6%** of tokens vs. raw `git status` on a tree with 2 modified + 17 untracked entries.

To confirm the hook is live inside Claude Code: restart the session, run any `git status` via Bash, then check `rtk gain` — the invocation should appear in the history.

## Disabling

Pick one:

- **Remove just the hook**: edit `~/.claude/settings.json` and delete the `{ "matcher": "Bash", ... "rtk hook claude" }` entry from `hooks.PreToolUse`.
- **Full revert**: `cp ~/.claude/settings.json.bak ~/.claude/settings.json`, then remove the `@RTK.md` line from `~/.claude/CLAUDE.md` and (optionally) delete `~/.claude/RTK.md`.
- **Bypass for a single command**: `rtk proxy <cmd>` runs raw, no filtering.

Restart Claude Code after any change to settings.json.

## Notes for this repo

These are user-global files, not repo state — do not commit `~/.claude/settings.json`, `~/.claude/RTK.md`, or the `@RTK.md` reference in `~/.claude/CLAUDE.md`. This document is the only artifact that belongs in the repo.
