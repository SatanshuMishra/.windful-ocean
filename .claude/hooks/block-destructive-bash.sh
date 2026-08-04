#!/usr/bin/env bash
input="$(cat)"
lowinput="$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]')"
case "$lowinput" in
  *rm* | *git* | *gh* | *dd* | *mkfs* | *':|:'* | *'>'*'/dev/'* | *'.claude'* ) : ;;
  *) exit 0 ;;
esac

cmd="$(printf '%s' "$input" | python3 -c 'import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
c = (d.get("tool_input") or {}).get("command", "") or ""
sys.stdout.write(" ".join(c.replace("\\\n", " ").split()))' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0

low="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"
has() { printf '%s' "$low" | grep -Eq "$1"; }
has_cs() { printf '%s' "$cmd" | grep -Eq "$1"; }
deny() {
  denyesc="$(REASON="$1" python3 -c 'import os, json, sys; sys.stdout.write(json.dumps(os.environ["REASON"]))' 2>/dev/null || printf '%s' '"This command is denied - it is human-gated."')"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "$denyesc"
  exit 0
}
reason=""
gitopt='(-c[[:space:]]+[^[:space:]]+|--git-dir[=[:space:]][^[:space:]]+|--work-tree[=[:space:]][^[:space:]]+|--namespace[[:space:]]+[^[:space:]]+|--no-pager|--paginate|-p|--bare|--literal-pathspecs|--no-optional-locks)'
gitpre="(^|[^a-z])git([[:space:]]+${gitopt})*[[:space:]]+"
gitopt_cs='(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--git-dir[=[:space:]][^[:space:]]+|--work-tree[=[:space:]][^[:space:]]+|--namespace[[:space:]]+[^[:space:]]+|--no-pager|--paginate|-p|--bare|--literal-pathspecs|--no-optional-locks)'
gitpre_cs="(^|[^a-zA-Z])git([[:space:]]+${gitopt_cs})*[[:space:]]+"

ghtok='(^|[^[:alnum:]_.-])([[:alnum:]_./-]*/)?gh[[:space:]]+'
ghapi="${ghtok}api([[:space:]]|$)"
graphql='(^|[[:space:]])graphql([[:space:]]|$)'
pullsep='repos/[^/[:space:]]+/[^/[:space:]]+/pulls/?([^/[:alnum:]]|$)'
pullnum='repos/[^/[:space:]]+/[^/[:space:]]+/pulls/[0-9]+([^/[:alnum:]]|$)'
postish='(--method[[:space:]=]+post|-x[[:space:]]*post|(^|[[:space:]])-f[[:space:]=]|--field[[:space:]=]|--raw-field[[:space:]=]|(^|[[:space:]])--input[[:space:]=])'
patchish='(--method[[:space:]=]+patch|-x[[:space:]]*patch)'
gqlopaque='((-f|--field|--raw-field)[[:space:]=]+[a-z_]+=@|(^|[[:space:]])--input[[:space:]=])'
ghfileref='(^|[[:space:]])(-f|--field|--raw-field)[[:space:]=]+[a-z_]+=@'
gqlsub='(\$\(|`)'
prshortedit='(^|[[:space:]])-(t|b|F)([^a-zA-Z-]|$)'
selfwrap='^([[:alnum:]_./-]*/)?node[[:space:]]+[^[:space:]]*lib/git/pr\.mjs[[:space:]]+pr-create([[:space:]]|$)'
chained='([;&|`]|\$\()'

if has "${ghtok}pr[[:space:]]+merge([[:space:]]|$)" \
  || { has "$ghapi" && has 'pulls/[^/[:space:]]+/merge([^[:alnum:]]|$)'; } \
  || { has "$ghapi" && has "$graphql" && has '(mergepullrequest|enablepullrequestautomerge)'; }; then
  deny "merging a PR is human-gated: mitosis never merges PRs (gh pr merge and the gh api pulls/*/merge REST endpoint are both blocked); a human merges via the PR after review"
fi

if ! { has "$selfwrap" && ! has "$chained"; }; then
  if has "${ghtok}pr[[:space:]]+create([[:space:]]|$)" \
    || { has "${ghtok}pr[[:space:]]+edit([[:space:]]|$)" && { has '(--title|--body|--body-file)([[:space:]=]|$)' || has_cs "$prshortedit"; }; } \
    || { has "$ghapi" && has "$ghfileref"; } \
    || { has "$ghapi" && has "$pullsep" && has "$postish"; } \
    || { has "$ghapi" && has "$pullnum" && has "$patchish"; } \
    || { has "$ghapi" && has "$graphql" && has 'createpullrequest'; } \
    || { has "$ghapi" && has "$graphql" && has "$gqlopaque"; } \
    || { has "$ghapi" && has "$graphql" && has "$gqlsub"; }; then
    deny 'opening a pull request is centralized: every pull request in this environment is created by one tool, in one format, and its title and body may not be rewritten afterwards. Run this, quoting every value: node "$HOME"/.claude/lib/git/pr.mjs pr-create --repo OWNER/REPO --head HEAD-BRANCH --base BASE-BRANCH --title TYPE(SCOPE): LOWERCASE IMPERATIVE SUMMARY --origin machine-or-human --why PROBLEM AND WHY NOW --what BEHAVIORAL CHANGE --not-verified THING YOU DID NOT CHECK - not run. Types: feat fix refactor docs test chore perf ci; title max 72 characters, no trailing period. Add --provenance agent=LABEL model=MODEL when --origin is machine. NEVER write a --verified line for a check you did not run. Pass every value as ONE inert argv value: never a file path, never an at-prefixed value, never a shell redirection, never a gh api field whose value starts with an at-sign. A pull/new URL printed by git push is not an approved path either. Full field set and caps: .claude/rules/common/git/pull-requests.md'
  fi
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
elif has_cs '\.claude/(settings(\.local)?\.json|CLAUDE\.md|keybindings\.json|hooks/|rules/|lib/|workflows/)' \
  && has_cs '(>|(^|[;&|[:space:]])tee[[:space:]]|(^|[;&|[:space:]])sed[[:space:]].*-i|(^|[;&|[:space:]])mv[[:space:]]|(^|[;&|[:space:]])cp[[:space:]]|(^|[;&|[:space:]])rm[[:space:]]|(^|[;&|[:space:]])chmod[[:space:]]|(^|[;&|[:space:]])truncate[[:space:]])'; then
  reason="shell write to Claude Code guardrail file"
fi

[ -z "$reason" ] && exit 0

esc="$(REASON="$reason" python3 -c 'import os, json, sys; sys.stdout.write(json.dumps("Destructive command (" + os.environ["REASON"] + ") - confirm before running."))' 2>/dev/null || printf '%s' '"Destructive command - confirm before running."')"
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":%s}}\n' "$esc"
exit 0
