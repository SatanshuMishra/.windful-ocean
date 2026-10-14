#!/usr/bin/env bash
set -euo pipefail

command -v graphify >/dev/null 2>&1 || exit 0
. "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/graphify-common.sh"

root="$(graphify_root)" || exit 0
out="$(graphify_out "$root")" || exit 0
graph="$out/graph.json"
log="${TMPDIR:-/tmp}/graphify-provision.log"

if [ ! -f "$graph" ]; then
  graphify_launch "$root" "$log" "$out" || true
  exit 0
fi

head_sha="$(git -C "$root" rev-parse --short=8 HEAD 2>/dev/null || true)"

summary="$(python3 -c '
import json, os, sys

out, graph, head = sys.argv[1], sys.argv[2], sys.argv[3]

try:
    with open(graph, encoding="utf-8") as f:
        g = json.load(f)
    nodes = len(g.get("nodes") or [])
    built = (g.get("built_at_commit") or "")[:8] or None
except Exception:
    sys.exit()

status = None
drop = 0
health = os.path.join(out, ".graphify_health.json")
try:
    if os.path.getmtime(health) >= os.path.getmtime(graph):
        with open(health, encoding="utf-8") as f:
            h = json.load(f)
        status = h.get("status")
        drop = int(h.get("drop_pct") or 0)
except Exception:
    pass

parts = ["Graphify: knowledge graph at %s" % graph]
if nodes:
    parts.append("%s nodes" % nodes)
if built:
    parts.append("built at %s" % built)
    if head and not head.startswith(built) and not built.startswith(head):
        parts.append("HEAD is %s, so files changed since are absent from it" % head)
line = ", ".join(parts) + "."

warn = ""
if nodes == 0:
    warn = " WARNING: the graph has no nodes. Do not trust it; grep instead."
elif status == "failed":
    warn = " WARNING: the last rebuild exited nonzero, so this graph is whatever survived the previous run. Treat it as stale."
elif status == "collapsed":
    warn = (" WARNING: the graph is %d%% below its recorded peak, so it is probably "
            "missing large parts of the repository; verify anything it tells you." % drop)

guide = (" Read it with the graphify skill. Prefer `graphify affected \"X\"` and "
         "`graphify explain \"X\"` over `graphify query`, which is unranked keyword BFS.")

print(json.dumps(line + warn + guide))
' "$out" "$graph" "$head_sha" 2>/dev/null || true)"

if [ -n "$summary" ]; then
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": $summary
  }
}
JSON
fi

exit 0
