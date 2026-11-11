#!/usr/bin/env bash
set -euo pipefail

command -v graphify >/dev/null 2>&1 || exit 0
. "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/graphify-common.sh"

root="$(graphify_root)" || exit 0
out="$(graphify_out "$root")" || exit 0
graph="$out/graph.json"
log="${TMPDIR:-/tmp}/graphify-refresh.log"

[ -e "$graph" ] || exit 0

newer="$(graphify_newer_than "$root" "$out" "$graph")"

[ -n "$newer" ] || exit 0

graphify_launch "$root" "$log" "$out" || exit 0
exit 0
