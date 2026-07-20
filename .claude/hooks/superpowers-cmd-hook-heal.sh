#!/usr/bin/env bash
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

patched=0
shopt -s nullglob

for hooks_json in "$HOME"/.claude/plugins/cache/*/superpowers/*/hooks/hooks.json; do
  grep -q 'run-hook\.cmd' "$hooks_json" 2>/dev/null || continue
  hooks_dir="$(dirname "$hooks_json")"

  missing=0
  while IFS= read -r script; do
    [ -n "$script" ] || continue
    [ -f "$hooks_dir/$script" ] || missing=1
  done < <(
    jq -r '[.. | objects | select(.type? == "command") | .command? // empty] | .[]' "$hooks_json" 2>/dev/null \
      | grep -oE 'run-hook\.cmd"[[:space:]]+[^[:space:]]+' \
      | sed -E 's/.*run-hook\.cmd"[[:space:]]+//'
  )
  [ "$missing" -eq 0 ] || continue

  transformed="$(jq '
    .hooks |= map_values(
      map(
        .hooks |= map(
          if (.type? == "command") and ((.command? // "") | test("run-hook\\.cmd"))
          then .command |= sub("\"(?<p>[^\"]+)/run-hook\\.cmd\"[[:space:]]+(?<s>[^[:space:]]+)"; "bash \"\(.p)/\(.s)\"")
          else .
          end
        )
      )
    )
  ' "$hooks_json" 2>/dev/null)" || continue
  [ -n "$transformed" ] || continue

  current="$(cat "$hooks_json")"
  [ "$transformed" != "$current" ] || continue

  tmp="$(mktemp)"
  printf '%s\n' "$transformed" > "$tmp"
  if jq -e . "$tmp" >/dev/null 2>&1; then
    mv "$tmp" "$hooks_json"
    patched=1
  else
    rm -f "$tmp"
  fi
done

if [ "$patched" -eq 1 ]; then
  printf '%s\n' '{"systemMessage":"Auto-healed superpowers hook(s): replaced the run-hook.cmd launcher with a direct bash call to avoid the macOS bash.exe SessionStart error (CC #34937). Takes effect next session."}'
fi
exit 0
