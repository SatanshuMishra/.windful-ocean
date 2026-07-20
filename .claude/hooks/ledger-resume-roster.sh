#!/usr/bin/env bash
set -u

input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0

prompt="$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null)"
[ -n "$prompt" ] || exit 0
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"

lc="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]' | sed -E 's/^[[:space:]]+//')"
intent=0
case "$lc" in
  continue|resume) intent=1 ;;
  continue\ *|resume\ *) intent=1 ;;
  /resume-project*) intent=1 ;;
  *"pick up where"*|"pick up the"*|"pick up "*) intent=1 ;;
esac
[ "$intent" -eq 1 ] || exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HOOK_DIR/lib/ledger-common.sh" 2>/dev/null || exit 0

ledger="$(ledger_locate "$cwd" "$transcript")" || exit 0
[ -d "$ledger/threads" ] || exit 0

roster=""
for f in "$ledger"/threads/*.md; do
  [ -e "$f" ] || continue
  status="$(ledger_field "$f" status)"
  case "$status" in
    active|paused|blocked) : ;;
    *) continue ;;
  esac
  slug="$(ledger_field "$f" thread)"
  [ -n "$slug" ] || slug="$(basename "$f" .md)"
  summary="$(ledger_field "$f" next_step)"
  [ -n "$summary" ] || summary="$(ledger_section_line "$f" "## Next Step")"
  [ -n "$summary" ] || summary="$(ledger_section_line "$f" "## Active Goal")"
  [ -n "$summary" ] || summary="$(ledger_section_line "$f" "## Objective")"
  [ -n "$summary" ] || summary="(no summary)"
  roster="${roster}- ${slug} [${status}] — ${summary}
"
done

[ -n "$roster" ] || exit 0

msg="Resume intent detected. Resumable ledger threads:
${roster}
Use the resume-project skill: if the user named a thread (/resume-project <slug>), load that one; otherwise present this list as a menu and STOP for the user to choose. Load only the chosen thread plus its latest session log, present the Resumption Brief, then STOP. Never auto-select by recency."

jq -cn --arg ctx "$msg" '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":$ctx}}'
exit 0
