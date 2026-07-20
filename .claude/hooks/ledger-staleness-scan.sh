#!/usr/bin/env bash
set -u

input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0

source_val="$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null)"
case "$source_val" in
  startup|resume|clear) : ;;
  *) exit 0 ;;
esac

cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HOOK_DIR/lib/ledger-common.sh" 2>/dev/null || exit 0

ledger="$(ledger_locate "$cwd" "$transcript")" || exit 0
[ -d "$ledger/threads" ] || exit 0

now_epoch="${LEDGER_NOW_EPOCH:-$(date -u +%s)}"

to_epoch() {
  _e="$(date -j -f "%Y-%m-%d" "$1" +%s 2>/dev/null)" || _e=""
  [ -n "$_e" ] || _e="$(date -d "$1" +%s 2>/dev/null)" || _e=""
  printf '%s' "$_e"
}

flags=""
for f in "$ledger"/threads/*.md; do
  [ -e "$f" ] || continue
  status="$(ledger_field "$f" status)"
  updated="$(ledger_field "$f" updated)"
  slug="$(ledger_field "$f" thread)"
  [ -n "$slug" ] || slug="$(basename "$f" .md)"
  upd_epoch="$(to_epoch "$updated")"
  days=""
  if [ -n "$upd_epoch" ]; then
    days=$(( (now_epoch - upd_epoch) / 86400 ))
  fi
  case "$status" in
    active)
      if [ -n "$days" ] && [ "$days" -gt 7 ]; then
        flags="${flags}- ${slug}: ACTIVE and idle ${days}d — active means this-session-only, so this is a zombie. Dispose: resume / pause / done / abandon.
"
      else
        flags="${flags}- ${slug}: ACTIVE at session start — active means this-session-only, likely a crashed session. Dispose: resume / pause / done / abandon.
"
      fi
      ;;
    paused)
      if [ -n "$days" ] && [ "$days" -gt 30 ]; then
        flags="${flags}- ${slug}: paused, idle ${days}d (>30) — confirm it is still wanted, or close it.
"
      fi
      ;;
    blocked)
      if [ -n "$days" ] && [ "$days" -gt 90 ]; then
        flags="${flags}- ${slug}: blocked, idle ${days}d (>90) — confirm the blocker still holds.
"
      fi
      ;;
  esac
done

[ -n "$flags" ] || exit 0

msg="Ledger staleness scan flagged threads needing disposition (never auto-closed):
${flags}
Surface these to the user and ask how to dispose each. Do not act on them silently."

jq -cn --arg ctx "$msg" '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$ctx}}'
exit 0
