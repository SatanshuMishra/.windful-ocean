#!/usr/bin/env bash
input="$(cat)"
case "$input" in
  *rm* | *git* | *gh* | *dd* | *mkfs* | *':|:'* | *'>'*'/dev/'* | *'.claude'* ) : ;;
  *) exit 0 ;;
esac

cmd="$(printf '%s' "$input" | python3 -c 'import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
sys.stdout.write((d.get("tool_input") or {}).get("command", "") or "")' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0

low="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"
has() { printf '%s' "$low" | grep -Eq "$1"; }
has_cs() { printf '%s' "$cmd" | grep -Eq "$1"; }
reason=""
gitopt='(-c[[:space:]]+[^[:space:]]+|--git-dir[=[:space:]][^[:space:]]+|--work-tree[=[:space:]][^[:space:]]+|--namespace[[:space:]]+[^[:space:]]+|--no-pager|--paginate|-p|--bare|--literal-pathspecs|--no-optional-locks)'
gitpre="(^|[^a-z])git([[:space:]]+${gitopt})*[[:space:]]+"
gitopt_cs='(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--git-dir[=[:space:]][^[:space:]]+|--work-tree[=[:space:]][^[:space:]]+|--namespace[[:space:]]+[^[:space:]]+|--no-pager|--paginate|-p|--bare|--literal-pathspecs|--no-optional-locks)'
gitpre_cs="(^|[^a-zA-Z])git([[:space:]]+${gitopt_cs})*[[:space:]]+"

if has '(^|[^[:alnum:]_./-])gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)' \
  || { has '(^|[^[:alnum:]_./-])gh[[:space:]]+api([[:space:]]|$)' && has 'pulls/[^/[:space:]]+/merge([^[:alnum:]]|$)'; }; then
  denyreason="merging a PR is human-gated: mitosis never merges PRs (gh pr merge and the gh api pulls/*/merge REST endpoint are both blocked); a human merges via the PR after review"
  denyesc="$(REASON="$denyreason" python3 -c 'import os, json, sys; sys.stdout.write(json.dumps(os.environ["REASON"]))' 2>/dev/null || printf '%s' '"Merging a PR is denied - merges are human-gated."')"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "$denyesc"
  exit 0
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
elif has ':[[:space:]]*\([[:space:]]*\)[[:space:]]*\{[[:space:]]*:[[:space:]]*\|[[:space:]]*:'; then
  reason="fork bomb"
elif has '(^|[^a-z])sudo[[:space:]]+rm'; then
  reason="sudo rm"
elif has_cs '\.claude/(settings(\.local)?\.json|CLAUDE\.md|keybindings\.json|hooks/|rules/)' \
  && has_cs '(>|(^|[;&|[:space:]])tee[[:space:]]|(^|[;&|[:space:]])sed[[:space:]].*-i|(^|[;&|[:space:]])mv[[:space:]]|(^|[;&|[:space:]])cp[[:space:]]|(^|[;&|[:space:]])rm[[:space:]]|(^|[;&|[:space:]])chmod[[:space:]]|(^|[;&|[:space:]])truncate[[:space:]])'; then
  reason="shell write to Claude Code guardrail file"
fi

[ -z "$reason" ] && exit 0

esc="$(REASON="$reason" python3 -c 'import os, json, sys; sys.stdout.write(json.dumps("Destructive command (" + os.environ["REASON"] + ") - confirm before running."))' 2>/dev/null || printf '%s' '"Destructive command - confirm before running."')"
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":%s}}\n' "$esc"
exit 0
