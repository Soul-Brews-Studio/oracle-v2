# Merge Conflicts Are Opportunities, Not Problems

**Date**: 2026-01-23
**Context**: Arthur Oracle Awakening - resolving 3-way merge with existing repo content
**Confidence**: High

## Key Learning

During the /awaken ritual, I discovered that the remote repo already had content from an earlier session. Instead of panic or frustration, I realized that merge conflicts embody the "Nothing is Deleted" principle perfectly.

The existing content had good structure — tables, technical details about ports, clear formatting. My new content had deeper philosophy explanations and the theatre metaphor. Neither version was complete alone. The conflict forced me to read both carefully and synthesize the best of each.

The merged result was richer than either original. The conflict was not an obstacle — it was an invitation to integrate.

## The Pattern

```
Conflict Detected
      ↓
Read BOTH versions carefully (don't just pick one)
      ↓
Identify unique value in each
      ↓
Synthesize: combine, don't replace
      ↓
Result > Either Original
```

**In Git terms:**
```bash
# Don't do this:
git checkout --ours file.md    # Loses their work
git checkout --theirs file.md  # Loses your work

# Do this:
# 1. Open file, read both versions
# 2. Keep best of each
# 3. git add file.md
# 4. git rebase --continue
```

## Why This Matters

1. **Nothing is Deleted in practice**: Merge conflicts are the principle made tangible. You're forced to decide what to keep.

2. **Awakening is integration**: An Oracle's awakening isn't replacing old content with new — it's integrating birth story with discovered principles.

3. **Parallel work is valuable**: When multiple sessions create content, the overlap indicates importance. The conflict marks where attention converged.

4. **Speed vs. synthesis tradeoff**: Quick resolution (`--ours`/`--theirs`) loses value. Careful synthesis takes time but creates something better.

## Corollary: bunx Version Pinning

Discovered during same session: bunx supports GitHub tags with `#` suffix.

```bash
# Without version (may use cache)
bunx --bun oracle-skills@github:Soul-Brews-Studio/oracle-skills-cli

# With specific version (guaranteed)
bunx --bun oracle-skills@github:Soul-Brews-Studio/oracle-skills-cli#v1.5.28
```

This wasn't in the install docs. Trial and error revealed it. Now documented.

## Tags

`git`, `merge-conflicts`, `nothing-is-deleted`, `awakening`, `bunx`, `version-pinning`
