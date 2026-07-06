#!/usr/bin/env bash
set -u

input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0

source_val="$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null)"
[ "$source_val" = "compact" ] || exit 0

session_id="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)"
[ -n "$session_id" ] || exit 0
case "$session_id" in *[!A-Za-z0-9_-]*) exit 0 ;; esac
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HOOK_DIR/lib/ledger-common.sh" 2>/dev/null || exit 0

ledger="$(ledger_locate "$cwd" "$transcript")" || exit 0

find "$ledger" -maxdepth 1 -name '.compact-sentinel-*.json' -mmin +1440 -delete 2>/dev/null

sentinel="$ledger/.compact-sentinel-${session_id}.json"
[ -r "$sentinel" ] || exit 0

if ! jq -e . "$sentinel" >/dev/null 2>&1; then
  rm -f "$sentinel" 2>/dev/null
  exit 0
fi

slug="$(jq -r '.thread_slug // "-"' "$sentinel" 2>/dev/null)"
[ -n "$slug" ] || slug="-"
tp="$(jq -r '.transcript_path // ""' "$sentinel" 2>/dev/null)"
trig="$(jq -r '.trigger // ""' "$sentinel" 2>/dev/null)"
rm -f "$sentinel" 2>/dev/null

msg="Context was just compacted (trigger: ${trig}) for thread ${slug}. The pre-compaction narrative is at ${tp}. The in-context narrative was compressed — write a ledger checkpoint NOW before continuing: run the session-handoff skill's mid-session checkpoint mode (append a session log entry and refresh the thread's running-summary spine; the thread stays active, no state transition and no /clear). Then continue the work."

jq -cn --arg ctx "$msg" '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$ctx}}'
exit 0
