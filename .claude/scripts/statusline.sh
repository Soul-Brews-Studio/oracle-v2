#!/bin/bash
# Robin's statusline helper
# Updates focus.md with current state

FOCUS_FILE="ψ/inbox/focus.md"

# Create if not exists
if [ ! -f "$FOCUS_FILE" ]; then
  echo "STATE: ready" > "$FOCUS_FILE"
  echo "TASK: รอคำสั่งจากเธอค่ะ" >> "$FOCUS_FILE"
  echo "SINCE: $(date '+%H:%M')" >> "$FOCUS_FILE"
fi

echo "Robin พร้อมช่วยเธอแล้วค่ะ"
