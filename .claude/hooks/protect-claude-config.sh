#!/usr/bin/env bash
input="$(cat)"
case "$input" in
  *'.claude'*) : ;;
  *) exit 0 ;;
esac

printf '%s' "$input" | python3 -c '
import sys, json, os

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)

fp = ((d.get("tool_input") or {}).get("file_path", "") or "")
if not fp:
    sys.exit(0)

home = os.path.expanduser("~")
home_base = os.path.join(home, ".claude")
bases = [home_base]
for probe in ("CLAUDE.md", "settings.json", "keybindings.json"):
    p = os.path.join(home_base, probe)
    try:
        rp = os.path.realpath(p)
    except Exception:
        continue
    if rp != p and os.path.basename(rp) == probe:
        rb = os.path.dirname(rp)
        if rb not in bases:
            bases.append(rb)
        break

exact = ("settings.json", "settings.local.json", "CLAUDE.md", "keybindings.json")
prefixes = ("hooks", "rules")

candidates = {fp}
try:
    candidates.add(os.path.realpath(fp))
except Exception:
    pass

def protected(path):
    for base in bases:
        for name in exact:
            if path == os.path.join(base, name):
                return True
        for name in prefixes:
            root = os.path.join(base, name)
            if path == root or path.startswith(root + os.sep):
                return True
    return False

if any(protected(c) for c in candidates):
    reason = "Modifying Claude Code guardrail file: " + fp + " - confirm this change is intended."
    out = {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": reason}}
    sys.stdout.write(json.dumps(out) + "\n")
sys.exit(0)
'
exit 0
