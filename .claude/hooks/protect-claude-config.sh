#!/usr/bin/env bash
input="$(cat)"
case "$input" in
  *'.claude'*) : ;;
  *) exit 0 ;;
esac

printf '%s' "$input" | python3 -c '
import sys, json, os

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if not isinstance(payload, dict):
    sys.exit(0)

tool_input = payload.get("tool_input")
if not isinstance(tool_input, dict):
    sys.exit(0)

fp = tool_input.get("file_path")
if not isinstance(fp, str) or not fp:
    sys.exit(0)

exact = ("settings.json", "settings.local.json", "CLAUDE.md", "keybindings.json", "CUTOVER", "LIVE")
prefixes = ("hooks", "rules", "lib", "workflows", "agents", "skills", "releases", "current", ".cutover", "local")
aside_marker = ".pre-cutover-"


def resolve(path):
    try:
        return os.path.realpath(path)
    except Exception:
        return path


def guarded_tail(parts):
    if not parts:
        return False
    head = parts[0]
    return head in exact or head in prefixes or aside_marker in head


def under(path, base):
    prefix = base.rstrip(os.sep) + os.sep
    if not path.startswith(prefix):
        return False
    return guarded_tail(path[len(prefix) :].split(os.sep))


home_base = os.path.join(os.path.expanduser("~"), ".claude")
bases = {home_base, resolve(home_base)}
candidates = {fp, resolve(fp)}

if not any(under(candidate, base) for candidate in candidates for base in bases):
    sys.exit(0)

reason = (
    "Denied: " + fp + " is the live installed Claude configuration, and editing it disarms a running control. "
    "Change the repository source under .claude/ instead and let the release pipeline promote it."
)
out = {
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }
}
sys.stdout.write(json.dumps(out) + "\n")
sys.stderr.write(reason + "\n")
sys.exit(2)
'
status=$?

case "$status" in
  0|2) exit "$status" ;;
esac

printf 'protect-claude-config: guard could not evaluate this write (interpreter exit %s); the live-config check did not run.\n' "$status" >&2
exit 0
