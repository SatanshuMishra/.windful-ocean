#!/usr/bin/env bash
set -eu

VERDICT_NONE="no-opinion"
VERDICT_DENY="deny"
FAULT_FALLBACK="the gate could not classify this command"

verdict=""
reason_text=""
fault_detail="no verdict was formed"
cmd="" low="" matcher_fault=""
seg_verdict="" seg_reason=""
best_verdict="" best_reason=""

ghwrap='(sudo|env|command|nohup|time|xargs|(ba|z|k)?sh[[:space:]]+-c|[a-z_][a-z0-9_]*=[^[:space:]]*)'

note_fault() {
  fault_detail="$1"
}

json_string() {
  local escaped=""
  if escaped="$(GATE_TEXT="$1" python3 -c 'import os, json, sys; sys.stdout.write(json.dumps(os.environ["GATE_TEXT"]))' 2>/dev/null)" && [ -n "$escaped" ]; then
    printf '%s' "$escaped"
  else
    printf '%s' "$2"
  fi
}

emit_verdict() {
  trap - EXIT INT TERM HUP
  local payload="" detail=""
  case "$verdict" in
    "$VERDICT_NONE")
      exit 0
      ;;
    "$VERDICT_DENY")
      payload="$(json_string "$reason_text" '"This command is denied - it is human-gated."')"
      ;;
    *)
      detail="${fault_detail//[\"\\]/}"
      [ -n "$detail" ] || detail="$FAULT_FALLBACK"
      verdict="$VERDICT_DENY"
      payload="\"Bash gate internal fault (${detail}) - the gate is denying rather than allowing. A repeat means the gate is broken and needs a human.\""
      ;;
  esac
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":%s}}\n' "$verdict" "$payload"
  exit 0
}

trap emit_verdict EXIT
trap 'exit 1' INT TERM HUP

EXTRACT_PY='import sys, json
try:
    d = json.load(sys.stdin)
    if not isinstance(d, dict):
        raise ValueError("payload is not an object")
    c = (d.get("tool_input") or {}).get("command", "") or ""
    if not isinstance(c, str):
        raise ValueError("command is not a string")
except Exception:
    sys.stdout.write("MALFORMED")
    sys.exit(0)
sys.stdout.write("COMMAND " + "\n".join(" ".join(p.split()) for p in c.replace("\\\n", " ").split("\n")))'

match_status() {
  local status=0
  printf '%s' "$2" | grep -Eq "$1" || status=$?
  case "$status" in
    0) return 0 ;;
    1) return 1 ;;
    *)
      matcher_fault="yes"
      return 1
      ;;
  esac
}

has() { match_status "$1" "$low"; }

has_cs() { match_status "$1" "$cmd"; }

set_deny() { seg_verdict="$VERDICT_DENY"; seg_reason="$1"; }

take_verdict() {
  case "$best_verdict" in
    "$VERDICT_DENY") return 0 ;;
  esac
  best_verdict="$1"; best_reason="$2"
}

classify_segment() {
  cmd="$1"
  low="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"

  local ghopt='(-[a-z][[:space:]]*[^[:space:]]+|--[a-z-]+[[:space:]=][^[:space:]]+)'
  local ghpos='(^[[:space:]]*|\$\(|`)'
  local ghtok="${ghpos}(${ghwrap}[[:space:]]+[\"']?[[:space:]]*)*([[:alnum:]_./-]*/)?gh([[:space:]]+${ghopt})*[[:space:]]+"
  local ghapi="${ghtok}api([[:space:]]|$)"
  local graphql='(^|[[:space:]])/?graphql([[:space:]]|$)'
  local pullbase='repos/[^/[:space:]]+/[^/[:space:]]+/pulls'
  local pullsep="${pullbase}/?([^/[:alnum:]]|$)"
  local pullnum="${pullbase}/[0-9]+([^/[:alnum:]]|$)"
  local postish='(--method[[:space:]=]+post|-x[[:space:]]*post|(^|[[:space:]])-f[[:space:]=]|--field[[:space:]=]|--raw-field[[:space:]=]|(^|[[:space:]])--input[[:space:]=])'
  local patchish='(--method[[:space:]=]+patch|-x[[:space:]]*patch)'
  local gqlopaque='((-f|--field|--raw-field)[[:space:]=]+[a-z_]+=@|(^|[[:space:]])--input[[:space:]=])'
  local ghfileref='(^|[[:space:]])(-f|--field|--raw-field)[[:space:]=]+[a-z_]+=@'
  local gqlsub='(\$\(|`)'
  local prshortedit='(^|[[:space:]])-(t|b|F)([^a-zA-Z-]|$)'

  local supatok="${ghpos}(${ghwrap}[[:space:]]+[\"']?[[:space:]]*)*([[:alnum:]_./-]*/)?supabase([[:space:]]+${ghopt})*[[:space:]]+"
  local suparemote="(db[[:space:]]+(push|pull)|migration[[:space:]]+up|functions[[:space:]]+deploy|link)([^[:alnum:]_-]|$)"

  if has "${supatok}${suparemote}"; then
    set_deny "connecting to a hosted Supabase project is human-gated: the agent authors migration SQL and a human applies it in the dashboard, which keeps the audit trail and the approval in human hands. Local disposable containers (supabase start, supabase db reset, supabase test db) are unrestricted. Rule: .claude/rules/common/no-direct-db-access.md"
    return 0
  fi

  if has "${ghtok}pr[[:space:]]+merge([[:space:]]|$)" \
    || { has "$ghapi" && has 'pulls/[^/[:space:]]+/merge([^[:alnum:]]|$)'; } \
    || { has "$ghapi" && has "$graphql" && has '(mergepullrequest|enablepullrequestautomerge|enqueuepullrequest)'; }; then
    set_deny "merging a PR is human-gated: gh pr merge and the gh api pulls/*/merge REST endpoint are both blocked; a human merges via the PR after review"
    return 0
  fi

  if has "${ghtok}pr[[:space:]]+create([[:space:]]|$)" \
    || { has "${ghtok}pr[[:space:]]+edit([[:space:]]|$)" && { has '(--title|--body|--body-file)([[:space:]=]|$)' || has_cs "$prshortedit"; }; } \
    || { has "$ghapi" && has "$pullbase" && has "$ghfileref"; } \
    || { has "$ghapi" && has "$pullsep" && has "$postish"; } \
    || { has "$ghapi" && has "$pullnum" && has "$patchish"; } \
    || { has "$ghapi" && has "$graphql" && has '(createpullrequest|updatepullrequest([^a-z]|$))'; } \
    || { has "$ghapi" && has "$graphql" && has "$gqlopaque"; } \
    || { has "$ghapi" && has "$graphql" && has "$gqlsub"; }; then
    set_deny 'opening a pull request is centralized: every pull request in this environment is created by one tool, in one format, and its title and body may not be rewritten afterwards. Run this, quoting every value: node "$HOME"/.claude/lib/git/pr.mjs pr-create --repo OWNER/REPO --head HEAD-BRANCH --base BASE-BRANCH --title TYPE(SCOPE): LOWERCASE IMPERATIVE SUMMARY --what THE BEHAVIOR THAT IS DIFFERENT NOW. --why THE PROBLEM THAT EXISTED BEFORE. --not-verified THING YOU DID NOT CHECK - not run. Types: feat fix refactor docs test chore perf ci; title max 72 characters, no trailing period. A --why, --what or --risk value starts with a capital letter and ends with a full stop. NEVER write a --verified line for a check you did not run. Pass every value as ONE inert argv value: never a file path, never an at-prefixed value, never a shell redirection, never a gh api field whose value starts with an at-sign. A pull/new URL printed by git push is not an approved path either. Full field set and caps: .claude/rules/common/git/pull-requests.md'
    return 0
  fi

  return 0
}

classify() {
  local input="" extracted="" segments="" segment=""

  if ! input="$(cat)"; then
    note_fault "the hook payload could not be read"
    return 0
  fi

  if ! extracted="$(printf '%s' "$input" | python3 -c "$EXTRACT_PY" 2>/dev/null)"; then
    note_fault "the payload parser could not be run"
    return 0
  fi

  case "$extracted" in
    "COMMAND "*)
      cmd="${extracted#COMMAND }"
      ;;
    *)
      note_fault "the hook payload could not be parsed"
      return 0
      ;;
  esac

  if [ -z "$cmd" ]; then
    verdict="$VERDICT_NONE"
    return 0
  fi

  segments="$(printf '%s' "$cmd" | tr ';&|' '\n\n\n')"

  while IFS= read -r segment; do
    [ -n "$segment" ] || continue
    seg_verdict=""
    seg_reason=""
    classify_segment "$segment"
    [ -z "$seg_verdict" ] || take_verdict "$seg_verdict" "$seg_reason"
  done <<< "$segments"

  if [ -n "$best_verdict" ]; then
    verdict="$best_verdict"
    reason_text="$best_reason"
    return 0
  fi

  if [ -n "$matcher_fault" ]; then
    note_fault "a command matcher could not be evaluated"
    return 0
  fi

  verdict="$VERDICT_NONE"
  return 0
}

classify
