#!/bin/bash
# Robin's fast recap - no AI, just git status
# Usage: .claude/scripts/recap.sh

R=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$R"

# Gather data
BRANCH=$(git branch --show-current 2>/dev/null || echo "no-git")
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
LAST_COMMIT=$(git log --oneline -1 2>/dev/null | cut -c9- | head -c60)
FOCUS_STATE=$(grep "^STATE:" ψ/inbox/focus.md 2>/dev/null | cut -d: -f2 | xargs)
FOCUS_TASK=$(grep "^TASK:" ψ/inbox/focus.md 2>/dev/null | cut -d: -f2- | head -c80)
RETRO=$(ls -t ψ/memory/retrospectives/**/*.md 2>/dev/null | head -1)
HANDOFF=$(ls -t ψ/inbox/handoff/*.md 2>/dev/null | head -1)

# Count files
git config core.quotePath false 2>/dev/null
MODIFIED=$(git status --porcelain 2>/dev/null | grep -c "^ M" || echo "0")
UNTRACKED=$(git status --porcelain 2>/dev/null | grep -c "^??" || echo "0")

# File lists (clean format)
MODIFIED_FILES=$(git status --porcelain 2>/dev/null | grep "^ M" | cut -c4- | sed 's/^/  /')
UNTRACKED_FILES=$(git status --porcelain 2>/dev/null | grep "^??" | cut -c4- | sed 's/^/  /')

# Output
echo "# Robin's Recap"
echo ""
echo "🕐 $(date '+%H:%M') | $(date '+%d %b %Y')"
echo ""
echo "---"
echo ""
echo "## 🎯 FOCUS"
echo "\`${FOCUS_STATE:-ready}\` ${FOCUS_TASK:-รอคำสั่งจากเธอค่ะ}"
echo ""
echo "## 📊 GIT: $BRANCH"
if [ "$AHEAD" != "0" ]; then
  echo "(+$AHEAD commits ahead)"
fi
if [ -n "$LAST_COMMIT" ]; then
  echo "Last: $LAST_COMMIT"
fi
echo ""
if [ "$MODIFIED" != "0" ]; then
  echo "**Modified** ($MODIFIED):"
  echo "$MODIFIED_FILES"
  echo ""
fi
if [ "$UNTRACKED" != "0" ]; then
  echo "**Untracked** ($UNTRACKED):"
  echo "$UNTRACKED_FILES"
  echo ""
fi
echo "---"
echo ""
echo "## 📝 LAST SESSION"
echo "Retro: $(basename "$RETRO" 2>/dev/null || echo 'none')"
echo "Handoff: $(basename "$HANDOFF" 2>/dev/null || echo 'none')"
echo ""
echo "---"
echo "💭 Robin พร้อมช่วยเธอแล้วค่ะ ทำอะไรต่อดี?"
