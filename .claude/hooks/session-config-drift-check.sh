#!/usr/bin/env bash
set -u

CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
DEFAULT_REPO_ROOT="$(cd "$HOOK_DIR/../.." 2>/dev/null && pwd)"
REPO_ROOT="${REPO_ROOT:-$DEFAULT_REPO_ROOT}"

[ -n "$REPO_ROOT" ] || exit 0
[ -d "$REPO_ROOT/.claude" ] || exit 0

drift=""

add_drift() {
  drift="${drift}- $1
"
}

resolve_path() {
  realpath "$1" 2>/dev/null
}

check_dir_symlink() {
  _name="$1"
  _actual="$CONFIG_DIR/$_name"
  _repo="$REPO_ROOT/.claude/$_name"

  if [ ! -e "$_repo" ]; then
    add_drift "$_name: repo path missing at $_repo"
    return
  fi

  _expected="$(resolve_path "$_repo")"
  if [ -z "$_expected" ]; then
    add_drift "$_name: cannot resolve repo path $_repo (realpath unavailable or failed), so linkage was not compared"
    return
  fi

  if [ ! -L "$_actual" ]; then
    if [ -e "$_actual" ]; then
      add_drift "$_name: $_actual exists but is not a symlink (expected symlink -> $_repo)"
    else
      add_drift "$_name: $_actual is missing (expected symlink -> $_repo)"
    fi
    return
  fi

  _resolved="$(resolve_path "$_actual")"
  if [ -z "$_resolved" ]; then
    add_drift "$_name: $_actual is a broken symlink"
    return
  fi

  if [ "$_resolved" != "$_expected" ]; then
    add_drift "$_name: $_actual resolves to $_resolved, expected $_expected (repo $_repo)"
  fi
}

check_dir_symlink "workflows"
check_dir_symlink "lib"

extract_invoked_hook_names() {
  _settings="$1"
  [ -f "$_settings" ] || return 0

  if command -v jq >/dev/null 2>&1; then
    jq -r '[.. | objects | select(.type? == "command") | .command? // empty] | .[]' "$_settings" 2>/dev/null \
      | grep -oE '\$HOME/\.claude/hooks/[^"[:space:]]+' \
      | sed -E 's#.*/hooks/##'
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$_settings" <<'PY'
import json, re, sys

path = sys.argv[1]
try:
    with open(path) as fh:
        data = json.load(fh)
except Exception:
    sys.exit(0)

names = set()
pattern = re.compile(r'\$HOME/\.claude/hooks/(\S+)')

def walk(node):
    if isinstance(node, dict):
        command = node.get("command")
        if isinstance(command, str):
            m = pattern.search(command)
            if m:
                names.add(m.group(1))
        for value in node.values():
            walk(value)
    elif isinstance(node, list):
        for item in node:
            walk(item)

walk(data.get("hooks", {}))
for name in sorted(names):
    print(name)
PY
    return 0
  fi

  return 1
}

hook_names="$(extract_invoked_hook_names "$CONFIG_DIR/settings.json")"
extract_status=$?

if [ "$extract_status" -ne 0 ]; then
  add_drift "hook comparison did not run: neither jq nor python3 is on PATH, so settings.json-invoked hooks were not checked against the repo"
elif [ -n "$hook_names" ]; then
  while IFS= read -r hook_name; do
    [ -n "$hook_name" ] || continue
    _local="$CONFIG_DIR/hooks/$hook_name"
    _repo_hook="$REPO_ROOT/.claude/hooks/$hook_name"

    if [ ! -f "$_local" ]; then
      add_drift "hook $hook_name: missing at $_local (settings.json invokes it)"
      continue
    fi
    if [ ! -f "$_repo_hook" ]; then
      add_drift "hook $hook_name: repo copy missing at $_repo_hook"
      continue
    fi
    if ! cmp -s "$_local" "$_repo_hook"; then
      add_drift "hook $hook_name: $_local differs from repo copy $_repo_hook"
    fi
  done <<< "$hook_names"
fi

[ -n "$drift" ] || exit 0

msg="SessionStart config-drift check found ~/.claude config out of sync with this repo (never auto-healed):
${drift}
Each item above needs human disposition: repair the symlink/hook manually or investigate why it changed."

if command -v jq >/dev/null 2>&1; then
  jq -cn --arg ctx "$msg" '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$ctx}}'
else
  escaped="$(python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' <<< "$msg" 2>/dev/null)"
  if [ -n "$escaped" ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' "$escaped"
  else
    printf '%s\n' "$msg" >&2
  fi
fi

exit 0
