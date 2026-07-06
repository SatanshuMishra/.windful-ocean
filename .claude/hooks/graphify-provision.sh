#!/usr/bin/env bash
set -euo pipefail

command -v graphify >/dev/null 2>&1 || exit 0
. "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/graphify-common.sh"

root="$(graphify_root)" || exit 0
out="${GRAPHIFY_OUT:-$root/graphify-out}"
graph="$out/graph.json"
log="${TMPDIR:-/tmp}/graphify-provision.log"

if [ -e "$graph" ] && git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

graphify_launch "$root" "$log" "$out/.hook.lock" || exit 0
exit 0
