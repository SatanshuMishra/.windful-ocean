#!/usr/bin/env bash
set -euo pipefail

command -v graphify >/dev/null 2>&1 || exit 0
. "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/graphify-common.sh"

root="$(graphify_root)" || exit 0
out="${GRAPHIFY_OUT:-$root/graphify-out}"
graph="$out/graph.json"
log="${TMPDIR:-/tmp}/graphify-refresh.log"

[ -e "$graph" ] || exit 0

newer="$(find "$root" -type f \
  -not -path "$out/*" \
  -not -path '*/.git/*' \
  -not -path '*/node_modules/*' \
  -not -path '*/.venv/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*' \
  -newer "$graph" -print -quit 2>/dev/null || true)"

[ -n "$newer" ] || exit 0

graphify_launch "$root" "$log" "$out/.hook.lock" || exit 0
exit 0
