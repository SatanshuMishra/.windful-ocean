#!/usr/bin/env bash
input="$(cat)"
case "$input" in
  *'.claude'*) : ;;
  *) exit 0 ;;
esac

printf '%s' "$input" | python3 -c '
import sys, json, os, subprocess

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)

fp = ((d.get("tool_input") or {}).get("file_path", "") or "")
if not fp:
    sys.exit(0)

exact = ("settings.json", "settings.local.json", "CLAUDE.md", "keybindings.json", "CUTOVER", "LIVE")
prefixes = ("hooks", "rules", "lib", "workflows", "releases", "current", ".cutover")
aside_marker = ".pre-cutover-"
probes = ("CLAUDE.md", "keybindings.json")
receipt_name = "LIVE"
receipt_byte_limit = 65536

def resolve(path):
    try:
        return os.path.realpath(path)
    except Exception:
        return path

candidates = [fp]
resolved_fp = resolve(fp)
if resolved_fp != fp:
    candidates.append(resolved_fp)

def guarded_tail(parts):
    if not parts:
        return False
    head = parts[0]
    return head in exact or head in prefixes or aside_marker in head


def under(path, base):
    prefix = base.rstrip(os.sep) + os.sep
    if not path.startswith(prefix):
        return False
    return guarded_tail(path[len(prefix):].split(os.sep))


def floored(path):
    parts = path.split(os.sep)
    for index, part in enumerate(parts):
        if part == ".claude" and guarded_tail(parts[index + 1:]):
            return True
    return False

def ask():
    reason = "Modifying Claude Code guardrail file: " + fp + " - confirm this change is intended."
    out = {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": reason}}
    sys.stdout.write(json.dumps(out) + "\n")
    sys.exit(0)

home_base = os.path.join(os.path.expanduser("~"), ".claude")
if any(under(c, home_base) for c in candidates):
    ask()

if any(floored(c) for c in candidates):
    ask()

repo_dirs = []

def claude_bearing(path):
    return os.path.isdir(os.path.join(path, ".claude")) or os.path.basename(path) == ".claude"

def note_repo_dir(path):
    if path and path not in repo_dirs and os.path.isdir(path) and claude_bearing(path):
        repo_dirs.append(path)

def receipt_repo_root(base):
    try:
        with open(os.path.join(base, receipt_name), "rb") as handle:
            raw = handle.read(receipt_byte_limit)
    except Exception:
        return None
    try:
        parsed = json.loads(raw.decode("utf-8", "replace"))
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    root = parsed.get("repo_root")
    if not isinstance(root, str) or not root.strip() or not os.path.isabs(root):
        return None
    return root

note_repo_dir(receipt_repo_root(home_base))

resolved_home_base = resolve(home_base)
if resolved_home_base != home_base:
    note_repo_dir(resolved_home_base)
for probe in probes:
    literal = os.path.join(home_base, probe)
    target = resolve(literal)
    if target != literal and os.path.basename(target) == probe:
        note_repo_dir(os.path.dirname(target))

def worktree_roots(cwd):
    for flags, sep in ((["--porcelain", "-z"], "\0"), (["--porcelain"], "\n")):
        try:
            done = subprocess.run(["git", "-c", "core.fsmonitor=", "-C", cwd, "worktree", "list"] + flags,
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5,
                                  env=dict(os.environ, GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL="/dev/null"))
        except Exception:
            return None
        if done.returncode != 0:
            continue
        roots = []
        for record in done.stdout.decode("utf-8", "replace").split(sep):
            if record.startswith("worktree "):
                root = record[len("worktree "):].rstrip("\r")
                if root:
                    roots.append(root)
        return roots or None
    return None

for repo_dir in repo_dirs:
    roots = worktree_roots(repo_dir)
    if roots is None:
        continue
    for root in roots:
        for base in (os.path.join(root, ".claude"), os.path.join(resolve(root), ".claude")):
            if os.path.isdir(base) and any(under(c, base) for c in candidates):
                ask()

sys.exit(0)
'
exit 0
