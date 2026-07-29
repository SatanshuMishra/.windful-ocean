#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="$HOME/.claude/state"
STATE="$STATE_DIR/superpowers-drift-state.json"
RESOLVER="$HOME/.claude/lib/superpowers-parallel/resolve-superpowers.mjs"

fail() {
  printf 'superpowers-drift-check: %s\n' "$1" >&2
  exit 1
}

[ -f "$RESOLVER" ] || fail "resolver missing at $RESOLVER; drift cannot be checked - the superpowers-parallel install is broken or was removed without deregistering this hook"

mkdir -p "$STATE_DIR" || fail "cannot create $STATE_DIR; drift state has nowhere to live"

if ! CUR="$(node "$RESOLVER" --state 2>/dev/null)"; then
  ERR="$(node "$RESOLVER" --state 2>&1 >/dev/null || true)"
  fail "resolver failed; drift cannot be checked: ${ERR:-nonzero exit, no stderr}"
fi
[ -n "$CUR" ] || fail "resolver printed nothing; drift cannot be checked"

if [ ! -f "$STATE" ]; then
  printf '%s\n' "$CUR" > "$STATE"
  exit 0
fi

PREV="$(cat "$STATE" 2>/dev/null || true)"
if [ "$CUR" != "$PREV" ]; then
  CUR_VER="$(printf '%s' "$CUR" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' 2>/dev/null || true)"
  printf 'Superpowers changed (now %s) - re-validate the mitosis contract (prompt/version drift detected; see ~/.claude/skills/mitosis/SKILL.md).\n' "$CUR_VER" >&2
  printf '%s\n' "$CUR" > "$STATE"
fi

exit 0
