#!/usr/bin/env python3
import json
import os
import glob
import re
import sys

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, ".claude")


def fail(msg, code=2):
    sys.stderr.write("explain-my-config audit: " + msg + "\n")
    sys.exit(code)


def preflight():
    if not os.path.isdir(ROOT):
        fail("scope error: " + ROOT + " not found; this skill audits only ~/.claude")
    if not (os.path.exists(os.path.join(ROOT, "settings.json"))
            or os.path.exists(os.path.join(ROOT, "CLAUDE.md"))):
        fail("scope error: " + ROOT + " is not a Claude config root")


def read_text(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read()
    except OSError:
        return ""


def load_json(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}


def frontmatter(text):
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    block = text[3:end].strip("\n")
    data = {}
    key = None
    for line in block.splitlines():
        match = re.match(r"^([A-Za-z0-9_-]+):\s?(.*)$", line)
        if match:
            key = match.group(1)
            data[key] = match.group(2).strip().strip('"')
        elif key and (line.startswith(" ") or line.startswith("\t")):
            data[key] += " " + line.strip()
    return data


def first_heading(text, fallback):
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def collect_rules():
    out = []
    claude_md = os.path.join(ROOT, "CLAUDE.md")
    if os.path.exists(claude_md):
        out.append({"path": "CLAUDE.md",
                    "title": first_heading(read_text(claude_md), "CLAUDE.md")})
    for path in sorted(glob.glob(os.path.join(ROOT, "rules", "**", "*.md"), recursive=True)):
        rel = os.path.relpath(path, os.path.join(ROOT, "rules"))
        out.append({"path": rel, "title": first_heading(read_text(path), rel)})
    return out


def collect_local_skills():
    out = []
    for path in sorted(glob.glob(os.path.join(ROOT, "skills", "*", "SKILL.md"))):
        meta = frontmatter(read_text(path))
        name = meta.get("name") or os.path.basename(os.path.dirname(path))
        out.append({"name": name, "description": meta.get("description", "")})
    return out


def collect_plugin_skills():
    out = []
    patterns = [
        os.path.join(ROOT, "plugins", "cache", "*", "*", "*", "skills", "*", "SKILL.md"),
        os.path.join(ROOT, "plugins", "cache", "*", "*", "*", "SKILL.md"),
    ]
    seen = set()
    for pattern in patterns:
        for path in sorted(glob.glob(pattern)):
            if path in seen:
                continue
            seen.add(path)
            rel = os.path.relpath(path, os.path.join(ROOT, "plugins", "cache"))
            parts = rel.split(os.sep)
            plugin = parts[1] if len(parts) > 1 else "?"
            meta = frontmatter(read_text(path))
            name = meta.get("name") or os.path.basename(os.path.dirname(path))
            out.append({"name": name,
                        "description": meta.get("description", ""),
                        "plugin": plugin})
    return out


def collect_agents():
    out = []
    for path in sorted(glob.glob(os.path.join(ROOT, "agents", "*.md"))):
        meta = frontmatter(read_text(path))
        name = meta.get("name") or os.path.splitext(os.path.basename(path))[0]
        tools = meta.get("tools", "")
        tool_count = len([t for t in tools.split(",") if t.strip()]) if tools else 0
        out.append({"name": name,
                    "description": meta.get("description", ""),
                    "tools": tool_count,
                    "model": meta.get("model", "")})
    return out


def collect_hooks(settings):
    out = []
    for event, blocks in settings.get("hooks", {}).items():
        for block in blocks:
            scripts = []
            for hook in block.get("hooks", []):
                command = hook.get("command", "")
                scripts.append(os.path.basename(command) if command else hook.get("type", "?"))
            out.append({"event": event,
                        "matcher": block.get("matcher", ""),
                        "scripts": scripts})
    return out


def collect_hook_scripts():
    return sorted(os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "hooks", "*.sh")))


def collect_plugins(settings):
    out = []
    for key, enabled in settings.get("enabledPlugins", {}).items():
        name, _, marketplace = key.partition("@")
        base = os.path.join(ROOT, "plugins", "cache", marketplace, name)
        versions = []
        if os.path.isdir(base):
            versions = [d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))]
        out.append({"name": name,
                    "marketplace": marketplace,
                    "version": sorted(versions)[-1] if versions else None,
                    "enabled": bool(enabled)})
    return out


def collect_commands():
    out = []
    for path in sorted(glob.glob(os.path.join(ROOT, "plugins", "cache", "*", "*", "*", "commands", "*.md"))):
        rel = os.path.relpath(path, os.path.join(ROOT, "plugins", "cache"))
        parts = rel.split(os.sep)
        out.append({"name": os.path.splitext(os.path.basename(path))[0],
                    "plugin": parts[1] if len(parts) > 1 else "?"})
    return out


def collect_mcp():
    out = []
    seen = set()
    user_config = load_json(os.path.join(HOME, ".claude.json"))
    for name in user_config.get("mcpServers", {}):
        if name not in seen:
            seen.add(name)
            out.append({"name": name, "source": "user config"})
    plugin_configs = (
        glob.glob(os.path.join(ROOT, "plugins", "cache", "*", "*", "*", ".claude-plugin", "plugin.json"))
        + glob.glob(os.path.join(ROOT, "plugins", "cache", "*", "*", "*", ".mcp.json"))
    )
    for path in plugin_configs:
        data = load_json(path)
        for name in data.get("mcpServers", {}):
            if name not in seen:
                seen.add(name)
                out.append({"name": name, "source": "plugin"})
    return out


def collect_settings(settings):
    permissions = settings.get("permissions", {})
    status_line = settings.get("statusLine", {})
    return {
        "model": settings.get("model"),
        "effortLevel": settings.get("effortLevel"),
        "statusLine": status_line.get("command") if isinstance(status_line, dict) else status_line,
        "autoMemory": bool(settings.get("autoMemoryEnabled")),
        "alwaysThinking": bool(settings.get("alwaysThinkingEnabled")),
        "permissions": {
            "allow": len(permissions.get("allow", [])),
            "deny": len(permissions.get("deny", [])),
            "ask": len(permissions.get("ask", [])),
        },
        "enabledPlugins": [k.split("@")[0] for k in settings.get("enabledPlugins", {})],
    }


def collect_cross_cutting():
    return {
        "memory": bool(glob.glob(os.path.join(ROOT, "projects", "*", "memory"))),
        "ledger": bool(glob.glob(os.path.join(ROOT, "projects", "*", "ledger"))),
        "graphify": os.path.isdir(os.path.join(ROOT, "graphify-out")),
    }


def main():
    preflight()
    settings = load_json(os.path.join(ROOT, "settings.json"))
    local_skills = collect_local_skills()
    plugin_skills = collect_plugin_skills()
    rules = collect_rules()
    agents = collect_agents()
    hooks = collect_hooks(settings)
    hook_scripts = collect_hook_scripts()
    plugins = collect_plugins(settings)
    commands = collect_commands()
    mcp = collect_mcp()
    result = {
        "root": ROOT,
        "rules": rules,
        "localSkills": local_skills,
        "pluginSkills": plugin_skills,
        "agents": agents,
        "hooks": hooks,
        "hookScripts": hook_scripts,
        "plugins": plugins,
        "commands": commands,
        "mcp": mcp,
        "settings": collect_settings(settings),
        "crossCutting": collect_cross_cutting(),
        "counts": {
            "localSkills": len(local_skills),
            "pluginSkills": len(plugin_skills),
            "skillsTotal": len(local_skills) + len(plugin_skills),
            "agents": len(agents),
            "rules": len(rules),
            "hookScripts": len(hook_scripts),
            "hookEvents": len({h["event"] for h in hooks}),
            "plugins": len(plugins),
            "commands": len(commands),
            "mcp": len(mcp),
        },
    }
    sys.stdout.write(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
