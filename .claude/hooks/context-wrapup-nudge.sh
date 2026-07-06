#!/usr/bin/env bash
set -u
NUDGE_PCT=70
URGENT_PCT=80
SENTINEL_PCT=50

input=$(cat) || exit 0
command -v jq >/dev/null 2>&1 || exit 0

session_id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
[ -n "$session_id" ] || exit 0

used_pct=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // empty' 2>/dev/null)

if [ -z "$used_pct" ]; then
  transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
  { [ -n "$transcript" ] && [ -r "$transcript" ]; } || exit 0
  window=$(printf '%s' "$input" | jq -r '.context_window.context_window_size // empty' 2>/dev/null)
  case "$window" in (''|*[!0-9]*) window=200000;; esac
  tokens=$(tail -n 200 "$transcript" | jq -rR 'fromjson? | select(.type=="assistant") | select(.isSidechain != true) | .message.usage | select(. != null) | ((.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0))' 2>/dev/null | tail -n 1)
  [ -n "$tokens" ] || exit 0
  case "$tokens" in (*[!0-9]*) exit 0;; esac
  used_pct=$(( tokens * 100 / window ))
fi

used_int=${used_pct%%.*}
case "$used_int" in (''|*[!0-9]*) exit 0;; esac

if [ "$used_int" -ge "$SENTINEL_PCT" ]; then
  run_dir="$HOME/.claude/run"
  mkdir -p "$run_dir" 2>/dev/null || exit 0
  printf '{"used_pct": %s, "ts": "%s"}\n' "$used_int" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$run_dir/context-sentinel-$session_id.json" 2>/dev/null
  find "$run_dir" -name 'context-sentinel-*.json' -mmin +1440 -delete 2>/dev/null
fi

marker="/tmp/claude-ledger-nudge-$session_id"
fired=0
[ -r "$marker" ] && fired=$(cat "$marker" 2>/dev/null)
case "$fired" in (''|*[!0-9]*) fired=0;; esac

msg=""
if [ "$used_int" -ge "$URGENT_PCT" ] && [ "$fired" -lt "$URGENT_PCT" ]; then
  msg="Context usage is at ${used_int}% — past the urgent threshold. Recommend immediate wrap-up: wind down running agents and tasks cleanly, then offer the user a session handoff now (session-handoff skill). The user may decline and continue."
  printf '%s' "$URGENT_PCT" > "$marker" 2>/dev/null
elif [ "$used_int" -ge "$NUDGE_PCT" ] && [ "$fired" -lt "$NUDGE_PCT" ]; then
  msg="Context usage is at ${used_int}%. Wind down running agents and tasks cleanly, then recommend a session handoff to the user (they may decline and continue without one). Once confirmed, use the session-handoff skill."
  printf '%s' "$NUDGE_PCT" > "$marker" 2>/dev/null
fi

[ -n "$msg" ] || exit 0
jq -cn --arg ctx "$msg" '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
exit 0
