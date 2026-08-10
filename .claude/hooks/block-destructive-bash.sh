#!/usr/bin/env bash
set -eu

VERDICT_NONE="no-opinion"
VERDICT_ASK="ask"
VERDICT_DENY="deny"
FAULT_FALLBACK="the gate could not classify this command"

verdict=""
reason_text=""
fault_detail="no verdict was formed"
cmd="" low="" reason="" matcher_fault=""
seg_verdict="" seg_reason=""
best_verdict="" best_reason=""

ghwrap='(sudo|env|command|nohup|time|xargs|(ba|z|k)?sh[[:space:]]+-c|[a-z_][a-z0-9_]*=[^[:space:]]*)'
guardname='(settings(\.local)?\.json|CLAUDE\.md|keybindings\.json|(hooks|rules|lib|workflows|releases|current|CUTOVER|LIVE)(/|[^[:alnum:]_./-]|$)|[^/[:space:]]*\.pre-cutover-[0-9a-f]+)'
guardpath="(\.claude/${guardname}|\.claude/?([^[:alnum:]_./-]|\$))"

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
    "$VERDICT_ASK")
      payload="$(json_string "$reason_text" '"Destructive command - confirm before running."')"
      ;;
    "$VERDICT_DENY")
      payload="$(json_string "$reason_text" '"This command is denied - it is human-gated."')"
      ;;
    *)
      detail="${fault_detail//[\"\\]/}"
      [ -n "$detail" ] || detail="$FAULT_FALLBACK"
      verdict="$VERDICT_ASK"
      payload="\"Bash gate internal fault (${detail}) - the gate is asking instead of allowing. Confirm before running.\""
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
    "$VERDICT_ASK") [ "$1" = "$VERDICT_DENY" ] || return 0 ;;
  esac
  best_verdict="$1"; best_reason="$2"
}

classify_segment() {
  cmd="$1"
  low="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"
  reason=""

  local gitopt='-c[[:space:]]+[^[:space:]]+|--git-dir[=[:space:]][^[:space:]]+|--work-tree[=[:space:]][^[:space:]]+|--namespace[[:space:]]+[^[:space:]]+|--no-pager|--paginate|-p|--bare|--literal-pathspecs|--no-optional-locks'
  local gitpre="(^|[^a-z])git([[:space:]]+(${gitopt}))*[[:space:]]+"
  local gitpre_cs="(^|[^a-zA-Z])git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|${gitopt}))*[[:space:]]+"

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

  local guardverb="(>|(^|[;&|[:space:]])tee[[:space:]]|(^|[;&|[:space:]])sed[[:space:]].*-i|(^|[;&|[:space:]])mv[[:space:]]|(^|[;&|[:space:]])cp[[:space:]]|(^|[;&|[:space:]])rm[[:space:]]|(^|[;&|[:space:]])chmod[[:space:]]|(^|[;&|[:space:]])truncate[[:space:]]|(^|[;&|[:space:]])perl[[:space:]]+(-[^[:space:]]+[[:space:]]+)*-[0-9aCdDFlnpsSuUwWxX]*i|${gitpre_cs}(checkout|restore)([[:space:]]|$))"
  local guardunlock='(^|[;&|[:space:]])chflags[[:space:]]+(-[^[:space:]]+[[:space:]]+)*[^[:space:]]*nouchg([[:space:]]|$)'

  if has "${ghtok}pr[[:space:]]+merge([[:space:]]|$)" \
    || { has "$ghapi" && has 'pulls/[^/[:space:]]+/merge([^[:alnum:]]|$)'; } \
    || { has "$ghapi" && has "$graphql" && has '(mergepullrequest|enablepullrequestautomerge|enqueuepullrequest)'; }; then
    set_deny "merging a PR is human-gated: mitosis never merges PRs (gh pr merge and the gh api pulls/*/merge REST endpoint are both blocked); a human merges via the PR after review"
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
    set_deny 'opening a pull request is centralized: every pull request in this environment is created by one tool, in one format, and its title and body may not be rewritten afterwards. Run this, quoting every value: node "$HOME"/.claude/lib/git/pr.mjs pr-create --repo OWNER/REPO --head HEAD-BRANCH --base BASE-BRANCH --title TYPE(SCOPE): LOWERCASE IMPERATIVE SUMMARY --origin machine-or-human --why PROBLEM AND WHY NOW --what BEHAVIORAL CHANGE --not-verified THING YOU DID NOT CHECK - not run. Types: feat fix refactor docs test chore perf ci; title max 72 characters, no trailing period. Add --provenance agent=LABEL model=MODEL when --origin is machine. NEVER write a --verified line for a check you did not run. Pass every value as ONE inert argv value: never a file path, never an at-prefixed value, never a shell redirection, never a gh api field whose value starts with an at-sign. A pull/new URL printed by git push is not an approved path either. Full field set and caps: .claude/rules/common/git/pull-requests.md'
    return 0
  fi

  if has '(^|[^a-z])rm([[:space:]]|$)' && has '(-[a-z]*r|--recursive)' && has '(-[a-z]*f|--force)'; then
    reason="recursive force remove (rm -rf)"
  elif has "${gitpre}push" && { has '[[:space:]]--force([^-]|$)' || has '(^|[[:space:]])-f([[:space:]]|$)'; } && ! has 'force-with-lease'; then
    reason="git force push"
  elif has "${gitpre}reset" && has '[[:space:]]--hard'; then
    reason="git reset --hard"
  elif has "${gitpre}clean" && has '(-[a-z]*f|--force)'; then
    reason="git clean -f"
  elif has "${gitpre}(filter-branch|filter-repo)"; then
    reason="git history rewrite"
  elif has "${gitpre}reflog[[:space:]]+expire" || { has "${gitpre}gc" && has '[[:space:]]--prune'; }; then
    reason="git gc/reflog prune"
  elif has "${gitpre}stash[[:space:]]+clear"; then
    reason="git stash clear"
  elif has_cs "${gitpre_cs}branch[[:space:]]+-[a-zA-Z]*D"; then
    reason="git branch force delete (-D)"
  elif has '(^|[^a-z])dd([[:space:]]|$)' && has 'of=/dev/'; then
    reason="dd to device"
  elif has '(^|[^a-z])mkfs'; then
    reason="mkfs filesystem format"
  elif has '>[[:space:]]*/dev/(sd|disk|nvme|hd)'; then
    reason="redirect to raw device"
  elif has '(^|[^a-z])sudo[[:space:]]+rm'; then
    reason="sudo rm"
  elif has_cs "$guardpath" && has_cs "$guardunlock"; then
    reason="chflags nouchg removing immutable-flag protection from a Claude Code guardrail file"
  elif has_cs "$guardpath" && has_cs "$guardverb"; then
    reason="shell write to Claude Code guardrail file"
  fi

  if [ -n "$reason" ]; then
    seg_verdict="$VERDICT_ASK"
    seg_reason="Destructive command (${reason}) - confirm before running."
  fi
  return 0
}

classify() {
  local input="" extracted="" segments="" segment=""
  local forkbomb=':[[:space:]]*\([[:space:]]*\)[[:space:]]*\{[[:space:]]*:[[:space:]]*\|[[:space:]]*:'
  local secretpath='(\.ssh/|\.aws/credentials|\.netrc|\.git-credentials|id_rsa|id_ed25519|\.npmrc|\.pgpass|\.kube/config|\.docker/config\.json|\.gnupg/|/etc/(passwd|shadow)|\.env(rc|\.local)?([^.[:alnum:]_-]|$))'
  local netpos='(^|[;&|]|\$\(|`)[[:space:]]*'
  local netbin="${netpos}(${ghwrap}[[:space:]]+[\"']?[[:space:]]*)*([[:alnum:]_./-]*/)?(curl|wget|nc|ncat|netcat|scp|rsync|sftp|ftp|telnet|openssl|http|httpie|xh)([[:space:]]|$)"
  local netreach='((https?|ftp)://|@[~/.$])'
  local atguard="@[^[:space:]]*${guardpath}"

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

  low="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"
  segments="$(printf '%s' "$cmd" | tr ';&|' '\n\n\n')"

  if has "$forkbomb"; then
    take_verdict "$VERDICT_ASK" "Destructive command (fork bomb) - confirm before running."
  fi

  if { has "$secretpath" && { has "$netbin" || has "$netreach"; }; } || has_cs "$atguard"; then
    take_verdict "$VERDICT_ASK" "Destructive command (possible credential or guardrail-file exfiltration) - confirm before running."
  fi

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
