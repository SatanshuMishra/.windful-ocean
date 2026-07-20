#!/bin/bash
# pre-commit-scoped-verify.sh — PreToolUse(Bash) BLOCKING on typecheck/lint failure.
#
# Filtering is done INSIDE this script via shlex argv walk, not via an `if:`
# directive in settings.json. The `if:` directive parses leading tokens
# literally and silently skips the hook for `git -C <path> commit …` forms.
# Do NOT re-add `if:` here.
set -e

input=$(cat)

# Fast bail-out: if "commit" substring absent, can't be a git-commit. Avoids
# spawning python3 on every Bash tool call.
case "$input" in
  *commit*) ;;
  *) exit 0 ;;
esac

# Walk argv to detect `git commit` regardless of global option position.
is_commit=$(echo "$input" | python3 -c '
import json, re, shlex, sys

FALLBACK_COMMIT_RE = re.compile(
    r"(?:\A|[;&|(]|\$\()\s*(?:[A-Za-z_]\w*=\S*\s+)*(?:[^\s;&|]*/)?git\s+"
    r"(?:[^\s;&|]+\s+)*?commit(?:[\s;&|]|\Z)"
)

def is_git_commit(cmd):
    try:
        tokens = shlex.split(cmd)
    except ValueError:
        return bool(FALLBACK_COMMIT_RE.search(cmd))
    i, n = 0, len(tokens)
    while i < n and "=" in tokens[i] and not tokens[i].startswith("-"):
        head = tokens[i].split("=", 1)[0]
        if head and (head[0].isalpha() or head[0] == "_"):
            i += 1
        else:
            break
    if i >= n or not (tokens[i] == "git" or tokens[i].endswith("/git")):
        return False
    i += 1
    OPTS_VAL_NEXT = {"-C", "-c"}
    OPTS_INLINE = ("--git-dir=", "--work-tree=", "--namespace=",
                   "--super-prefix=", "--config-env=", "--exec-path=",
                   "--list-cmds=")
    STANDALONE = {"--bare", "--no-replace-objects", "--no-optional-locks",
                  "--literal-pathspecs", "--icase-pathspecs",
                  "--no-lazy-fetch", "-P", "--no-pager", "--paginate", "-p",
                  "--exec-path", "--html-path", "--man-path", "--info-path",
                  "--version", "--help", "-h"}
    while i < n:
        t = tokens[i]
        if t in OPTS_VAL_NEXT: i += 2
        elif t.startswith(OPTS_INLINE): i += 1
        elif t in STANDALONE: i += 1
        elif t == "commit": return True
        elif t.startswith("-"): i += 1
        else: return False
    return False

data = json.load(sys.stdin)
print("true" if is_git_commit(data.get("tool_input", {}).get("command", "")) else "false")
' 2>/dev/null || echo "false")

[ "$is_commit" != "true" ] && exit 0

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

# Only if it's a Node/TS project
if [ ! -f "package.json" ]; then
  exit 0
fi

# Changed files (staged)
changed=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
[ -z "$changed" ] && exit 0

# Filter to TS/JS files
ts_files=$(echo "$changed" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$' || true)

find_up() {
  local dir name
  dir=$(cd "$1" 2>/dev/null && pwd) || return 1
  shift
  while : ; do
    for name in "$@"; do
      if [ -e "$dir/$name" ]; then return 0; fi
    done
    if [ "$dir" = "/" ]; then return 1; fi
    dir=$(dirname "$dir")
  done
}

has_eslint_config() {
  if find_up "$project_dir" \
    eslint.config.js eslint.config.mjs eslint.config.cjs \
    eslint.config.ts eslint.config.mts eslint.config.cts \
    .eslintrc .eslintrc.js .eslintrc.cjs .eslintrc.mjs \
    .eslintrc.json .eslintrc.yml .eslintrc.yaml; then return 0; fi
  if grep -q '"eslintConfig"' package.json 2>/dev/null; then return 0; fi
  return 1
}

# Typecheck if any TS files
if echo "$ts_files" | grep -qE '\.(ts|tsx)$' && ! find_up "$project_dir" tsconfig.json; then
  echo "SKIP: type-check — no tsconfig.json resolves from $project_dir upward."
elif echo "$ts_files" | grep -qE '\.(ts|tsx)$'; then
  tsc_out=$(npx tsc --noEmit --incremental 2>&1) && tsc_rc=0 || tsc_rc=$?
  echo "$tsc_out" | tail -50
  if [ "$tsc_rc" -ne 0 ]; then
    echo "BLOCKED: Type-check failed. Fix before committing." >&2
    exit 2
  fi
fi

# Lint touched JS/TS files
if [ -n "$ts_files" ] && ! has_eslint_config; then
  echo "SKIP: lint — no ESLint config resolves from $project_dir upward."
elif [ -n "$ts_files" ]; then
  # shellcheck disable=SC2086
  if ! npx eslint --no-error-on-unmatched-pattern $ts_files 2>&1; then
    echo "BLOCKED: Lint failed on changed files. Fix before committing." >&2
    exit 2
  fi
fi

exit 0
