#!/usr/bin/env bash
# lint-on-edit.sh — PostToolUse hook that runs `eslint --fix` on the changed file.
# Receives JSON tool-result payload via stdin: { tool_input: { file_path: "..." }, ... }
# Exits 0 always (advisory only). Emits findings to stderr for the agent to see.

set -u

# Parse file_path from stdin JSON. Use python3 for robust JSON parsing (always available on macOS).
input="$(cat)"
file_path="$(printf '%s' "$input" | python3 -c 'import sys, json; d=json.load(sys.stdin); print((d.get("tool_input") or {}).get("file_path",""))' 2>/dev/null || true)"

# Bail silently if no file_path.
if [ -z "$file_path" ]; then
  exit 0
fi

# Bail silently if file does not exist (e.g., file was deleted by tool).
if [ ! -f "$file_path" ]; then
  exit 0
fi

# Path filter: only TS/JS files.
case "$file_path" in
  *.ts|*.tsx|*.mjs|*.js|*.cjs) ;;
  *) exit 0 ;;
esac

# Path filter: skip anything under any `.claude/` directory (avoids recursion when editing skill/agent/rule files).
case "$file_path" in
  */.claude/*|.claude/*) exit 0 ;;
esac

# Walk up to find a package.json containing "eslint" — gives us the project root.
dir="$(cd "$(dirname "$file_path")" && pwd)"
project_root=""
while [ "$dir" != "/" ] && [ -n "$dir" ]; do
  if [ -f "$dir/package.json" ] && grep -qE '"eslint"[[:space:]]*:' "$dir/package.json" 2>/dev/null; then
    project_root="$dir"
    break
  fi
  dir="$(dirname "$dir")"
done

if [ -z "$project_root" ]; then
  # No eslint project found — silently exit.
  exit 0
fi

# Pick a portable wall-timeout wrapper. GNU coreutils ships `timeout`; macOS without
# Homebrew has neither `timeout` nor `gtimeout`. Falling through to no wall guard is
# preferable to skipping eslint entirely. (Empty TIMEOUT_PREFIX is intentional;
# word-splitting it into the command is the goal here.)
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_PREFIX="timeout 5"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_PREFIX="gtimeout 5"
else
  TIMEOUT_PREFIX=""
fi

# Run eslint --fix with (optional) 5-second wall timeout.
# `--no-warn-ignored` suppresses noise on files excluded by .eslintignore.
# shellcheck disable=SC2086  # intentional word-splitting of TIMEOUT_PREFIX
output="$(cd "$project_root" && $TIMEOUT_PREFIX npx eslint --fix --no-warn-ignored "$file_path" 2>&1)"
status=$?

# Status 124 is only reachable when TIMEOUT_PREFIX is set; bare eslint does not exit 124.
if [ $status -eq 124 ]; then
  echo "[hook:lint-on-edit] timed out after 5s on $file_path" >&2
  exit 0
fi

if [ $status -ne 0 ]; then
  # Count "problem" lines as remaining violations (eslint exit 1 = lint errors remain).
  # eslint summary format: "✖ N problems (X errors, Y warnings)"
  problems=$(printf '%s' "$output" | grep -oE '✖ [0-9]+ problems?' | grep -oE '[0-9]+' | head -1 || true)
  if [ -n "$problems" ]; then
    echo "[hook:lint-on-edit] $problems violations remain in $file_path (after autofix)" >&2
  else
    # eslint's first output line is usually the file path; the actionable diagnostic
    # is typically further down. Grab the first line matching error-ish keywords,
    # or fall back to the last non-empty line of output.
    err_msg="$(printf '%s' "$output" | grep -iEm1 'error|cannot|couldn|failed' || true)"
    if [ -z "$err_msg" ]; then
      err_msg="$(printf '%s' "$output" | awk 'NF{last=$0} END{print last}')"
    fi
    echo "[hook:lint-on-edit] eslint error on $file_path: $err_msg" >&2
  fi
fi

exit 0
