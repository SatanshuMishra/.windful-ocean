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

exact = ("settings.json", "settings.local.json", "CLAUDE.md", "keybindings.json")
prefixes = ("hooks", "rules", "lib", "workflows")
probes = ("CLAUDE.md", "settings.json", "keybindings.json")

def resolve(path):
    try:
        return os.path.realpath(path)
    except Exception:
        return path

candidates = [fp]
resolved_fp = resolve(fp)
if resolved_fp != fp:
    candidates.append(resolved_fp)

def under(path, base):
    for name in exact:
        if path == os.path.join(base, name):
            return True
    for name in prefixes:
        root = os.path.join(base, name)
        if path == root or path.startswith(root + os.sep):
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

repo_dirs = []

def note_repo_dir(path):
    if path and path not in repo_dirs and os.path.isdir(path):
        repo_dirs.append(path)

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
            done = subprocess.run(["git", "-C", cwd, "worktree", "list"] + flags,
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5)
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

derived = False
for repo_dir in repo_dirs:
    roots = worktree_roots(repo_dir)
    if roots is None:
        continue
    derived = True
    for root in roots:
        for base in (os.path.join(root, ".claude"), os.path.join(resolve(root), ".claude")):
            if any(under(c, base) for c in candidates):
                ask()

if not derived:
    for candidate in candidates:
        parts = candidate.split(os.sep)
        for index, part in enumerate(parts):
            if part == ".claude" and index + 1 < len(parts) and parts[index + 1] in prefixes + exact:
                ask()

sys.exit(0)
'
exit 0
