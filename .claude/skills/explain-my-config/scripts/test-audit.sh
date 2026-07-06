#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
python3 "$DIR/audit-config.py" | python3 -c '
import json, sys, os, glob
data = json.load(sys.stdin)
required = ["root", "counts", "rules", "localSkills", "pluginSkills",
            "agents", "hooks", "hookScripts", "plugins", "commands",
            "mcp", "settings", "crossCutting"]
missing = [k for k in required if k not in data]
assert not missing, "missing keys: %s" % missing
root = data["root"]
agent_files = glob.glob(os.path.join(root, "agents", "*.md"))
assert data["counts"]["agents"] == len(agent_files), \
    "agent count %d != files %d" % (data["counts"]["agents"], len(agent_files))
assert data["counts"]["skillsTotal"] == \
    data["counts"]["localSkills"] + data["counts"]["pluginSkills"], "skill total mismatch"
print("OK: contract valid; agents=%d skills=%d hooks=%d"
      % (data["counts"]["agents"], data["counts"]["skillsTotal"], data["counts"]["hookEvents"]))
'
