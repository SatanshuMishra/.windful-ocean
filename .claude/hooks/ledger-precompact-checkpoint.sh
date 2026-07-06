#!/usr/bin/env bash
set -u

input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0

session_id="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)"
[ -n "$session_id" ] || exit 0
case "$session_id" in *[!A-Za-z0-9_-]*) exit 0 ;; esac
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"
trigger="$(printf '%s' "$input" | jq -r '.trigger // empty' 2>/dev/null)"

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HOOK_DIR/lib/ledger-common.sh" 2>/dev/null || exit 0

ledger="$(ledger_locate "$cwd" "$transcript")" || exit 0

thread_slug="-"
if [ -d "$ledger/threads" ]; then
  for f in "$ledger"/threads/*.md; do
    [ -e "$f" ] || continue
    if [ "$(ledger_field "$f" status)" = "active" ]; then
      thread_slug="$(ledger_field "$f" thread)"
      [ -n "$thread_slug" ] || thread_slug="$(basename "$f" .md)"
      break
    fi
  done
fi

sentinel="$ledger/.compact-sentinel-${session_id}.json"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
tmp="$(mktemp "${sentinel}.XXXXXX" 2>/dev/null)" || exit 0
if jq -cn \
  --arg sid "$session_id" \
  --arg slug "$thread_slug" \
  --arg tp "$transcript" \
  --arg tr "$trigger" \
  --arg ts "$ts" \
  '{session_id:$sid, thread_slug:$slug, transcript_path:$tp, trigger:$tr, ts:$ts}' \
  > "$tmp" 2>/dev/null; then
  mv "$tmp" "$sentinel" 2>/dev/null
fi
rm -f "$tmp" 2>/dev/null

exit 0
