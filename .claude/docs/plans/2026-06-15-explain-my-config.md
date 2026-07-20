# explain-my-config Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local `~/.claude/skills/explain-my-config/` skill that audits the live global `~/.claude` configuration and renders a single interactive HTML learning hub via the visual-explainer skill.

**Architecture:** Three deterministic stages on each run — (1) a Python audit script emits a structured JSON inventory of the live config; (2) Claude synthesizes that inventory into a content spec using stable reference scaffolding (glossary, content-model, pipeline-narrative), reconciled against the live inventory; (3) the visual-explainer skill renders one self-contained `claude-config-explained.html`. The skill is hard-pinned to `~/.claude` and rejects any other target.

**Tech Stack:** Markdown SKILL.md (instructions), Python 3 (audit script + smoke test glue), Bash (test runner), the existing `visual-explainer` skill (renderer). No network, no database.

**Spec:** `~/.claude/docs/specs/2026-06-15-explain-my-config-design.md`

---

## File Structure

```
~/.claude/skills/explain-my-config/
  SKILL.md                       # orchestration: scope guard, audit -> synthesize -> render, modes
  scripts/
    audit-config.py              # emits structured JSON inventory of the live ~/.claude config
    test-audit.sh                # smoke test: JSON contract + agent-count cross-check
  references/
    glossary.md                  # plain-language definitions for jargon terms (tooltip source)
    content-model.md             # the 7 tabs + what each explains + synthesis guidance
    pipeline-narrative.md        # canonical feature pipeline steps + hooks/rules per step
```

Responsibilities, one per file:
- `audit-config.py` — the only component that reads the filesystem; produces the single source of truth (the inventory). Refines the spec's `audit-config.sh` to Python for robust JSON + frontmatter parsing.
- `test-audit.sh` — proves the script's JSON contract and that counts match ground truth.
- `glossary.md` / `content-model.md` / `pipeline-narrative.md` — stable explanatory scaffolding the synthesis step draws from, always reconciled against the live inventory.
- `SKILL.md` — the runtime orchestration the main agent follows when the user runs `/explain-my-config`.

---

### Task 1: Audit script

**Files:**
- Create: `~/.claude/skills/explain-my-config/scripts/audit-config.py`

- [ ] **Step 1: Create the script**

Create `~/.claude/skills/explain-my-config/scripts/audit-config.py` with exactly this content (no comments per global rule):

```python
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
```

- [ ] **Step 2: Make it executable and run it**

Run:
```bash
chmod +x ~/.claude/skills/explain-my-config/scripts/audit-config.py
python3 ~/.claude/skills/explain-my-config/scripts/audit-config.py | python3 -m json.tool > /dev/null && echo "VALID JSON"
```
Expected: prints `VALID JSON` (the script emits parseable JSON).

- [ ] **Step 3: Eyeball the counts**

Run:
```bash
python3 ~/.claude/skills/explain-my-config/scripts/audit-config.py | python3 -c "import json,sys;print(json.load(sys.stdin)['counts'])"
```
Expected: a dict like `{'localSkills': 10, 'pluginSkills': 16, 'skillsTotal': 26, 'agents': 13, 'rules': 24, 'hookScripts': 14, 'hookEvents': 5, 'plugins': 13, 'commands': 12, 'mcp': >=2}` (exact numbers reflect current config).

---

### Task 2: Audit script smoke test

**Files:**
- Create: `~/.claude/skills/explain-my-config/scripts/test-audit.sh`

- [ ] **Step 1: Write the failing test first**

Create `~/.claude/skills/explain-my-config/scripts/test-audit.sh` with exactly this content:

```bash
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
```

- [ ] **Step 2: Run it to verify it passes against the real config**

Run:
```bash
chmod +x ~/.claude/skills/explain-my-config/scripts/test-audit.sh
bash ~/.claude/skills/explain-my-config/scripts/test-audit.sh
```
Expected: `OK: contract valid; agents=13 skills=26 hooks=5` (numbers reflect current config). To confirm it actually fails on a broken contract, temporarily rename a required key in `audit-config.py`, re-run, observe the `AssertionError`, then revert.

---

### Task 3: Glossary reference

**Files:**
- Create: `~/.claude/skills/explain-my-config/references/glossary.md`

- [ ] **Step 1: Create the glossary**

Create `~/.claude/skills/explain-my-config/references/glossary.md` with exactly this content:

```markdown
# Glossary — plain-language definitions

The synthesis step attaches these as hover tooltips on each term's FIRST appearance in the hub.
Keep each definition to one sentence, jargon-free. Verify the named thing still exists in the live
inventory before asserting specifics.

- **Skill** — a saved procedure (a Markdown file) that Claude loads and follows step-by-step when a matching task appears; think "a playbook for one kind of work".
- **Agent / subagent** — a separate Claude worker spun up with a fresh, empty memory to do one scoped job and report back, so the main conversation stays uncluttered.
- **Orchestrator** — the main Claude in your session; it routes and reviews work but delegates the actual doing to subagents.
- **Rule** — an always-on instruction (in CLAUDE.md or `rules/`) that constrains how Claude behaves in every task, no invocation needed.
- **Hook** — a small script the system runs automatically at a fixed moment (a "lifecycle event") to check, block, or react to what Claude is doing.
- **Lifecycle event** — a named moment in a session when hooks may fire: session start, before a tool runs, after a tool runs, when Claude stops, or on a notification.
- **Plugin** — an installable bundle that adds capabilities (skills, commands, agents, or tool servers) to Claude, downloaded from a "marketplace".
- **Marketplace** — a catalog/source that plugins are installed from.
- **MCP (Model Context Protocol)** — a standard way for Claude to talk to an external tool or service (a browser, a code-navigation server, GitHub) through a small connector program called an "MCP server".
- **MCP server** — the connector program that exposes one external service's abilities to Claude as tools.
- **Slash command** — a shortcut you type starting with `/` that triggers a saved prompt or skill.
- **Frontmatter** — the small block of settings fenced by `---` at the top of a Markdown file (name, description, etc.) that tools read to understand the file.
- **Tool** — a single action Claude can take (read a file, run a shell command, edit code); tools are what hooks gate and what agents are granted.
- **Memory (auto-memory)** — durable per-project notes Claude keeps so a later session remembers decisions that aren't written in the code.
- **Continuity ledger** — per-project files that teach the next session the cumulative state of the work (what's decided, what's in progress).
- **graphify** — a locally-built "map" of a codebase (a knowledge graph) Claude queries to orient itself before drilling in.
- **Serena** — an MCP server for precise code navigation (find every caller, every implementation) and symbol-level edits.
- **Effort level** — a setting that tunes how much reasoning the model spends per turn.
- **Permissions (allow / deny / ask)** — rules deciding which tool actions run automatically, which are blocked, and which prompt you first.
- **Statusline** — the custom info bar shown at the bottom of the session.
- **TDD (test-driven development)** — write a failing test first, then the code to make it pass.
- **Drill-down** — opening one subsystem or flow in greater depth than the overview.
```

---

### Task 4: Content-model reference

**Files:**
- Create: `~/.claude/skills/explain-my-config/references/content-model.md`

- [ ] **Step 1: Create the content model**

Create `~/.claude/skills/explain-my-config/references/content-model.md` with exactly this content:

```markdown
# Content model — the 7 sections of the hub

Render as ONE scrollable page with a sticky section-nav that behaves like tabs (use
visual-explainer's `responsive-nav.md` pattern; 4+ sections require it). Principles to apply:
overview-first then details-on-demand (Shneiderman + progressive disclosure); explanation not
reference (lead with why/what-it-affects, never a raw field dump); chunk into these ~7 groups; cut
visual noise; define every jargon term inline via tooltip on first use; make it consequential where
possible ("if this changes, these change"). Each section pulls from the named inventory keys.

1. **Overview** — inventory: `counts`, `settings`, `crossCutting`.
   A whole-config map: counts at a glance, then a diagram of how the parts relate (rules constrain
   everything; skills are invoked; agents are dispatched by the orchestrator; hooks fire on events;
   plugins/MCP add capabilities; memory/ledger/graphify persist context). One lead paragraph:
   "what is all this?"

2. **Skills** — inventory: `localSkills`, `pluginSkills`, `counts`.
   Define "skill". Group by purpose, not source: process (brainstorming, planning, debugging),
   implementation, project-continuity (resume-project, session-handoff), verification. Use a table
   (name, one-line purpose, local/plugin). Explain how skills are invoked and how they compose
   (e.g. brainstorming -> writing-plans -> subagent-driven-development).

3. **Agents** — inventory: `agents`.
   Define "subagent" and the orchestrator-vs-worker model (main thread routes; subagents do the
   work in fresh context). Table of the agents (name, role from description, tool count, model).
   Note the delegation discipline: even a one-line fix is dispatched.

4. **Rules** — inventory: `rules`.
   Define "rule". Show the hierarchy: CLAUDE.md at the top, then `common/` (apply everywhere) and
   `typescript/` (language-specific). Explain always-on vs invoked, and precedence (user rules
   outrank skills). Group rules thematically (git, testing, security, tooling, memory).

5. **Hooks** — inventory: `hooks`, `hookScripts`.
   Define "hook" and "lifecycle event". Render a table/diagram of event -> matcher -> scripts
   (SessionStart, PreToolUse, PostToolUse, Stop, Notification). For each script, one line on what it
   guards or does. This is the "automated reflexes" section — emphasize consequence ("editing a
   file triggers secret-scanner + protect-claude-config before the write lands").

6. **Plugins & Integrations** — inventory: `plugins`, `commands`, `mcp`, `crossCutting`.
   Define "plugin", "marketplace", "MCP", "MCP server". Table of enabled plugins (name,
   marketplace, version). List slash commands they add. List MCP servers (name, source) and what
   each connects to. Then the cross-cutting systems: memory, continuity-ledger, graphify,
   tool-routing — one card each.

7. **The Feature Pipeline** — built from `pipeline-narrative.md`, reconciled against inventory.
   The centerpiece: a Mermaid `flowchart TD` tracing a generic feature end-to-end, with hooks and
   rules annotated at each step. See `pipeline-narrative.md`.

## Observations (explain-first, light)

Add ONE small, clearly-labeled "Things to notice" callout where genuinely useful (e.g. two skills
with overlapping purpose, an agent never referenced, a rule with no enforcing hook). Describe only;
never prescribe a fix. End each with a one-line pointer to which other skill would make the change.
Do not turn this into an audit-findings report.
```

---

### Task 5: Pipeline-narrative reference

**Files:**
- Create: `~/.claude/skills/explain-my-config/references/pipeline-narrative.md`

- [ ] **Step 1: Create the pipeline narrative**

Create `~/.claude/skills/explain-my-config/references/pipeline-narrative.md` with exactly this content:

```markdown
# Feature pipeline narrative

Trace a generic "build feature X" request through the configured machine. Render as a Mermaid
`flowchart TD` inside visual-explainer's full zoom-enabled `diagram-shell` (never bare
`<pre class="mermaid">`). Below the diagram, show a step table annotating the hooks that fire and
the rules that constrain at each step.

RECONCILE BEFORE ASSERTING: for every skill, agent, or hook named below, confirm it appears in the
live inventory (from `audit-config.py`). If something is absent, omit or grey it out and note the
gap — never assert a piece that no longer exists.

## Steps

1. **Request arrives** — rule: skill-check first (using-superpowers); the orchestrator looks for a
   matching skill before acting.
2. **Brainstorm** — skill: brainstorming. Produces a design/spec; HARD-GATE blocks implementation
   until approved.
3. **Plan** — skill: writing-plans. Turns the spec into bite-sized tasks.
4. **Dispatch** — skills: subagent-driven-development / dispatching-parallel-agents. Rule:
   delegation-discipline (main thread orchestrates; subagents implement).
5. **Implement** — agent: implementer (or mechanical-editor for rote edits; test-engineer for
   tests). Rule: testing.md admission gate + scoped TDD; no-comments; coding-style (immutability).
   Hooks (PreToolUse on Edit/Write): block-env-edits, secret-scanner, protect-claude-config.
   Hooks (PostToolUse on Edit/Write): lint-on-edit, ui-ux-audit-on-edit.
6. **Review** — agents: code-reviewer, plus security-reviewer on security-relevant diffs. Rule:
   address CRITICAL/HIGH before proceeding.
7. **Verify** — skill: verification-before-completion; project `/verify-<project>` scoped by
   verification-strategist. Hook (PreToolUse on Bash at commit): pre-commit-scoped-verify.
8. **Commit** — plugin: commit-commands; rules: git/commits (Conventional Commits, atomic),
   git/branching (never commit to default branch). Hook (Bash): block-destructive-bash guards
   dangerous git.
9. **Persist context** — skill: session-handoff writes the continuity ledger; auto-memory stores
   durable decisions. Hook (Stop): graphify-refresh updates the codebase map; notify-complete pings.

## Cross-cutting throughout

- Tool routing (graphify -> Serena -> grep) governs how every read happens.
- no-direct-db-access forbids touching live databases/cloud at any step.
- Permissions (allow/deny/ask) gate which tool actions run, block, or prompt.
```

---

### Task 6: SKILL.md orchestration

**Files:**
- Create: `~/.claude/skills/explain-my-config/SKILL.md`

- [ ] **Step 1: Create SKILL.md**

Create `~/.claude/skills/explain-my-config/SKILL.md` with exactly this content:

```markdown
---
name: explain-my-config
description: Use when the user runs /explain-my-config or asks to explain, visualize, audit, map, or understand their global Claude configuration (~/.claude — skills, agents, rules, hooks, plugins, MCP servers, settings, and the feature pipeline). Audits the live ~/.claude config and renders a single interactive HTML learning hub via visual-explainer. ONLY explains ~/.claude; it rejects any request to explain another repo, project, directory, or path.
---

# Explain My Config

Explain the user's CURRENT global Claude configuration as a single interactive HTML learning hub.
Sole focus: visualize and explain. Never edit configuration; defer changes to other skills.

## Scope guard (CRITICAL — honor before anything else)

This skill explains ONLY the global config at `$HOME/.claude`. It is not a general codebase or
config explainer.

- Always target absolute `$HOME/.claude`. Ignore the current working directory entirely: running
  from inside any project still explains only `~/.claude`, never that project or its local
  `.claude/`.
- The optional argument is a closed enum of AREAS (below), never a path. If the argument looks like
  a filesystem path, a URL, a repo/project name, or any request to "explain <other thing>", STOP
  and reply: "explain-my-config only explains your global ~/.claude configuration. For another
  project, use a general code-explanation tool instead." Do not partially comply.
- The audit script performs a preflight that exits if `$HOME/.claude` is not a config root.

## Run protocol

1. **Audit (gather facts).** Run the audit script and capture its JSON:
   `python3 ~/.claude/skills/explain-my-config/scripts/audit-config.py`
   This JSON is the single source of truth. Describe only what it contains — never invent config.
2. **Synthesize (organize + explain).** Read the three references and build the content spec:
   - `references/content-model.md` — the 7 sections and what each explains.
   - `references/glossary.md` — attach a tooltip definition to each jargon term on first use.
   - `references/pipeline-narrative.md` — the feature-pipeline steps; RECONCILE every named
     skill/agent/hook against the inventory before asserting it.
   Write explanation-mode prose (why/what-it-affects), not a field dump. Add the small, clearly
   labeled "Things to notice" observations where genuinely useful; never prescribe fixes.
3. **Render (visualize).** Invoke the visual-explainer skill (Skill tool:
   `visual-explainer:visual-explainer`) to produce ONE self-contained HTML file from the content
   spec. Direct it to:
   - Read its `references/responsive-nav.md` and use the sticky section-nav for the 7 sections
     (acts as the tab bar).
   - Render the feature pipeline as a Mermaid `flowchart TD` using the full zoom-enabled
     `diagram-shell` from its `templates/mermaid-flowchart.html`.
   - Render the agents and hooks inventories as real `<table>` elements
     (`templates/data-table.html`).
   - Use `<details>`/`<summary>` for per-item depth (details-on-demand) and tooltip spans for
     jargon definitions.
   - Pick a constrained, technical aesthetic (Blueprint or Editorial). No emoji.
   - Write to `~/.claude/docs/claude-config-explained.html`.
4. **Deliver.** Open it (`open ~/.claude/docs/claude-config-explained.html`) and tell the user the
   path.

## Modes

- `explain-my-config` (no argument) -> full overview hub, all 7 sections. Overview uses only the
  inventory (frontmatter-level facts) — cheap, no full-body reads.
- `explain-my-config <area>` -> deep-dive on ONE area, reading full file bodies for that slice only
  (and MAY fan out parallel subagents since this is heavier). Recognized `<area>` enum:
  `skills`, `agents`, `rules`, `hooks`, `plugins`, `mcp`, `pipeline`, `settings`, `memory`,
  `ledger`. An out-of-scope or path-like argument is rejected per the scope guard above. A bare
  near-miss typo of an area falls back to the overview with a one-line note.

## Constraints

- Read-only: never modify any configuration file.
- No network, no database, no cloud surface.
- Honors no-comments (the rendered HTML and scripts carry no explanatory comments).
```

- [ ] **Step 2: Confirm the skill is discoverable**

Run:
```bash
ls -1 ~/.claude/skills/explain-my-config ~/.claude/skills/explain-my-config/scripts ~/.claude/skills/explain-my-config/references
head -3 ~/.claude/skills/explain-my-config/SKILL.md
```
Expected: all files present; SKILL.md begins with the `---` frontmatter and `name: explain-my-config`.

---

### Task 7: End-to-end acceptance (orchestrator-run)

**Files:** none created. This task verifies the assembled skill. The render step invokes the
visual-explainer skill via the Skill tool, so it runs in the main session (the orchestrator), not a
tool-restricted subagent.

- [ ] **Step 1: Run the audit + contract test**

Run:
```bash
bash ~/.claude/skills/explain-my-config/scripts/test-audit.sh
```
Expected: `OK: contract valid; ...`.

- [ ] **Step 2: Execute the skill's run protocol once (no argument)**

Follow `SKILL.md` end-to-end: run the audit, synthesize the content spec from the references
(reconciling the pipeline against the inventory), invoke `visual-explainer:visual-explainer` to
render to `~/.claude/docs/claude-config-explained.html`, and open it.

- [ ] **Step 3: Acceptance checks against the live config**

Verify in the rendered hub:
- Counts in the Overview match `audit-config.py` output (agents, skills, rules, hooks, plugins, MCP).
- All 7 sections render and the sticky nav jumps to each.
- The pipeline is a zoomable Mermaid `flowchart TD`; every skill/agent/hook it names exists in the
  inventory.
- Jargon terms show a definition on hover; agents/hooks are real tables.
- No emoji; no console errors on open.

- [ ] **Step 4: Verify the scope guard rejects out-of-scope targets**

Confirm by inspection of `SKILL.md` and by a dry prompt that `explain-my-config /some/other/repo`
(or "explain this project") triggers the rejection message and does NOT render. The audit script's
preflight and the SKILL.md scope guard are both present.

---

## Self-Review (completed during planning)

- **Spec coverage:** every spec section maps to a task — audit/IR (T1), JSON contract test (T2),
  glossary/jargon (T3), 7-tab content model + observations (T4), feature pipeline (T5), SKILL.md
  with scope guard + modes + visual-explainer composition (T6), end-to-end + scope-guard
  verification (T7). Output medium (single interactive HTML hub), modes (overview + drill-down),
  explain-first + light observations, and the hard scope guard are all covered.
- **Placeholder scan:** none — every file's full content is inlined.
- **Type/contract consistency:** the JSON keys emitted by `audit-config.py` (Task 1) are exactly
  the keys asserted by `test-audit.sh` (Task 2) and consumed by `content-model.md` (Task 4) and
  `SKILL.md` (Task 6): `root, counts, rules, localSkills, pluginSkills, agents, hooks, hookScripts,
  plugins, commands, mcp, settings, crossCutting`.
- **Deviation from spec:** the audit script is Python (`audit-config.py`), not `audit-config.sh`, for
  robust JSON + frontmatter parsing; output path is `~/.claude/docs/claude-config-explained.html`
  (visual-explainer's default is `~/.agent/diagrams/`, overridden here to keep the artifact in the
  config tree). Both are recorded here intentionally.
```
