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
