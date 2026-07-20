#!/usr/bin/env bash
set -euo pipefail

STATE="$HOME/.claude/lib/superpowers-parallel/.drift-state.json"
RESOLVER="$HOME/.claude/lib/superpowers-parallel/resolve-superpowers.mjs"

[ -f "$RESOLVER" ] || exit 0

CUR="$(node "$RESOLVER" --state 2>/dev/null || true)"
[ -n "$CUR" ] || exit 0

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
