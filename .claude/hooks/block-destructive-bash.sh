#!/usr/bin/env bash
set -eu

VERDICT_NONE="no-opinion"
VERDICT_DENY="deny"
FAULT_FALLBACK="the gate could not classify this command"
SEGMENT_LIMIT=64
CHAIN_DENY_REASON="this command chains more commands than the gate can judge inside its timeout and names gh, so it is denied; run it as shorter commands"
ACCEPTED_CREATE_FORM="render the title and body with pull-request render --fields <file> --body-out <body file>, then run gh pr create --title '<printed title>' --body-file <body file> --base <base> --head <branch> as its own Bash command; the pull-request plugin's hook checks the title and body"

verdict=""
reason_text=""
fault_detail="no verdict was formed"
whole_cmd="" cmd="" low="" matcher_fault=""
seg_verdict="" seg_reason=""
best_verdict="" best_reason=""

ghwrap='(sudo|env|command|nohup|time|xargs|eval|(ba|z|k)?sh[[:space:]]+-c|[a-z_][a-z0-9_]*=[^[:space:]]*)'

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

EXTRACT_PY='import re, sys, json
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
lines = "\n".join(" ".join(p.split()) for p in re.sub(r"(?<!\\)((?:\\\\)*)\\\n", r"\1", c).split("\n")).replace("\x00", "")
names_gh = re.search(r"(^|[^A-Za-z0-9_.-])[Gg][Hh]([^A-Za-z0-9_.-]|$)", lines)
sys.stdout.write("COMMAND " + lines if names_gh else "NO_GH")'

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

has_whole() { match_status "$1" "$whole_cmd"; }

is_plain_create() {
  local flagend='([[:space:]=]|$)'
  local forbidden='--fill|--fill-first|--fill-verbose|-f|--web|-w|--editor|-e|--template|-T|--body|-b|--recover'
  case "$whole_cmd" in
    *$'\n'* | *'`'* | *'$('* | *';'* | *'&'* | *'|'* | *'<'* | *'>'* | *'\'*) return 1 ;;
  esac
  has_whole '^[[:space:]]*gh[[:space:]]+pr[[:space:]]+create[[:space:]]' \
    && has_whole "(^|[[:space:]])(--title|-t)${flagend}" \
    && has_whole "(^|[[:space:]])(--body-file|-F)([[:space:]]+|=)[\"']?[^-[:space:]\"']" \
    && ! has_whole "(^|[[:space:]])(${forbidden})${flagend}"
}

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
  local pullcollection="${pullbase}/?([^0-9/]|$)"
  local postish='(--method[[:space:]=]+post|-x[[:space:]]*post|(^|[[:space:]])-f[[:space:]=]|--field[[:space:]=]|--raw-field[[:space:]=]|(^|[[:space:]])--input[[:space:]=])'
  local gqlopaque='((-f|--field|--raw-field)[[:space:]=]+[a-z_]+=@|(^|[[:space:]])--input[[:space:]=])'
  local ghfileref='(^|[[:space:]])(-f|--field|--raw-field)[[:space:]=]+[a-z_]+=@'
  local gqlsub='(\$\(|`)'

  if has "${ghtok}pr[[:space:]]+merge([[:space:]]|$)" \
    || { has "$ghapi" && has 'pulls/[^/[:space:]]+/merge([^[:alnum:]]|$)'; } \
    || { has "$ghapi" && has "$graphql" && has '(mergepullrequest|enablepullrequestautomerge|enqueuepullrequest)'; }; then
    set_deny "merging a PR is human-gated: gh pr merge and the gh api pulls/*/merge REST endpoint are both blocked; a human merges via the PR after review"
    return 0
  fi

  if has "${ghtok}pr[[:space:]]+(create|new)([[:space:]]|$)"; then
    is_plain_create && return 0
    set_deny "opening a pull request takes one form: ${ACCEPTED_CREATE_FORM}. Title grammar and body fields: the pull-request:open skill."
    return 0
  fi

  if { has "$ghapi" && has "$pullcollection" && has "$ghfileref"; } \
    || { has "$ghapi" && has "$pullsep" && has "$postish"; } \
    || { has "$ghapi" && has "$graphql" && has 'createpullrequest'; } \
    || { has "$ghapi" && has "$graphql" && has "$gqlopaque"; } \
    || { has "$ghapi" && has "$graphql" && has "$gqlsub"; }; then
    set_deny "gh api is not a way to open a pull request: a POST to the pulls endpoint and a createPullRequest or opaque GraphQL call are denied. Open one this way: ${ACCEPTED_CREATE_FORM}."
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
    "NO_GH")
      verdict="$VERDICT_NONE"
      return 0
      ;;
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

  whole_cmd="$cmd"

  segments="$(printf '%s' "$cmd" | tr ';&|' '\n\n\n')"
  segment_count="$(printf '%s\n' "$segments" | grep -c . || true)"
  if [ "${segment_count:-0}" -gt "$SEGMENT_LIMIT" ]; then
    low="$(printf '%s' "$whole_cmd" | tr '[:upper:]' '[:lower:]')"
    if has '(^|[^[:alnum:]_.-])gh([^[:alnum:]_.-]|$)'; then
      verdict="$VERDICT_DENY"
      reason_text="$CHAIN_DENY_REASON"
    elif [ -n "$matcher_fault" ]; then
      note_fault "a command matcher could not be evaluated"
    else
      verdict="$VERDICT_NONE"
    fi
    return 0
  fi

  while IFS= read -r segment; do
    case "$segment" in
      *[Gg][Hh]*) ;;
      *) continue ;;
    esac
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
