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
