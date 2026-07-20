# Design: `explain-my-config` skill

- Date: 2026-06-15
- Status: approved (design); pending spec review → writing-plans
- Author: brainstorming session
- Location of skill: `~/.claude/skills/explain-my-config/`

## Purpose

A local skill that explains the user's **current** Claude global configuration as a single
interactive HTML learning hub. Its sole focus is to **visualize and explain** what the
configuration contains, what each part is, how each part works, how parts are used, and how a
generic feature flows through the entire pipeline. It is a learning tool the user runs to
understand — and later improve (via other skills) — their setup.

Re-running re-audits the live config, so the output is never stale.

**Hard scope (CRITICAL):** this skill explains ONLY the global `~/.claude/` configuration. It is
never a general codebase/config explainer. Any attempt to point it at another project, repo, or
path is rejected. See "Scope guard" below.

### Goals

- Explain ALL aspects of the configuration: skills, agents, rules, hooks, plugins, MCP servers,
  settings, and the cross-cutting systems (memory, continuity-ledger, graphify, tool-routing).
- Define every piece of jargon in plain language, inline, on first use.
- Show the end-to-end feature-development pipeline as a narrative/flow.
- Support a comprehensive overview AND focused drill-downs into one subsystem or flow.
- Surface a small, clearly-separated set of "things to notice" (overlaps, unused pieces) without
  performing or prescribing changes.

### Non-goals

- NOT a config editor or improver. It never modifies configuration. Changes are deferred to other
  skills.
- NOT a reference dump. It explains meaning and relationships, not every field verbatim.
- NOT a one-time generated artifact. It re-audits live on each run.
- NOT a general-purpose codebase/config explainer. It explains ONLY `~/.claude/`. It must reject
  any request to explain another project, repo, or arbitrary path.

## Scope guard (CRITICAL hard constraint)

The skill is hard-pinned to the global Claude configuration at `$HOME/.claude` and must refuse any
attempt to repurpose it for another codebase.

- **Fixed target.** Every read targets absolute `$HOME/.claude/...`. The skill ignores the current
  working directory entirely — running it from inside any project repo still explains ONLY the
  global `~/.claude` config, never that project's files or its local `.claude/` directory.
- **No path arguments.** The optional argument is a closed enum of global-config *areas* (see Modes),
  not a path. An argument that looks like a filesystem path, a URL, a repo/project name, or anything
  resembling "explain <other thing>" is rejected.
- **Explicit rejection.** If the user asks to run it against a project, repo, directory, or any
  target other than `~/.claude`, the skill stops and replies that it explains only the global
  `~/.claude` configuration, and points to the appropriate general tool/skill instead. It does not
  partially comply.
- **Preflight check.** Stage 1 verifies `$HOME/.claude` exists and is the global config root before
  doing anything; if invoked with an out-of-scope target it exits at this gate without rendering.

This guard is stated prominently at the top of `SKILL.md` so it is honored before any audit begins.

## Learning-design principles (sourced)

The design is built on five evidence-based principles:

1. **Explanation, not reference** — lead with why each part matters and what it affects, not a
   field-by-field dump — [diataxis.fr](https://diataxis.fr/explanation/).
2. **Overview-first, details-on-demand** — one whole-config map, then zoom/filter, exact values on
   click — [Shneiderman 1996](https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf),
   [NN/G progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
3. **Chunk into ~5–7 groups, cut visual noise** — [Cognitive Load Theory](https://edtechbooks.org/encyclopedia/cognitive_load_theory).
4. **Make it consequential** — show downstream effects ("flip this flag → these change") —
   [explorable explanations](https://blog.ncase.me/explorable-explanations/).
5. **Inline plain-language definitions on hover** for every term — [Google style: jargon](https://developers.google.com/style/jargon).

## Architecture: A1 — audit → model → render

Three deterministic stages on every run.

### Stage 1 — Audit (gather facts)

A helper script (`scripts/audit-config.sh`) enumerates the live configuration and emits a single
structured JSON **inventory**. It reads only; it never connects to any service. It first asserts the
target is `$HOME/.claude` (the scope guard's preflight) and uses absolute `$HOME/.claude/...` paths
throughout — never the current working directory. Sources:

| Subsystem | Source |
|---|---|
| Rules | `~/.claude/CLAUDE.md`, `~/.claude/rules/**/*.md` |
| Local skills | `~/.claude/skills/*/SKILL.md` (name + `description` from frontmatter) |
| Plugin skills | `~/.claude/plugins/cache/*/*/*/skills/*/SKILL.md` |
| Agents | `~/.claude/agents/*.md` (name, description, tools from frontmatter) |
| Hooks | `~/.claude/hooks/*.sh` + the `hooks` block in `~/.claude/settings.json` (event → script) |
| Plugins | `enabledPlugins` in `settings.json` + each `plugin.json` manifest |
| Slash commands | `~/.claude/plugins/cache/*/*/*/commands/*.md` |
| MCP servers | settings + plugin manifests (context7, serena, playwright, github, …) |
| Settings | `settings.json`: model, effortLevel, statusLine, autoMemoryEnabled, permissions summary, env |
| Cross-cutting | presence of `projects/<slug>/memory/`, `ledger/`, `graphify-out/` |

The inventory is the single source of truth for the render step; the renderer may only describe
what the inventory contains (honest audit — no invented config).

### Stage 2 — Synthesize (organize + explain)

Claude reads the inventory and produces a **content spec** for the visual:

- Groups the inventory into the 7 tabs below.
- Writes explanation-mode prose (why/what-it-affects), not enumeration.
- Attaches a plain-language definition to every jargon term (drawn from `references/glossary.md`,
  verified against the live inventory).
- Builds the feature-pipeline narrative from `references/pipeline-narrative.md`, **cross-checking
  that every skill/agent/hook it references still exists in the live inventory** before asserting
  it (derived scaffolding must not drift from live state).
- Adds the small "things to notice" observations block.

### Stage 3 — Render (visualize)

Hands the content spec to the **visual-explainer** skill, which produces one self-contained
`claude-config-explained.html` (single file, inline CSS/JS, hover tooltips, tabbed navigation).

## Content model — the 7 tabs

1. **Overview** — counts at a glance; "what is all this and how do the pieces relate?" A whole-config
   map showing the major groups and how they connect (rules constrain everything; skills are
   invoked; agents are dispatched; hooks fire on events; plugins/MCP add capabilities).
2. **Skills** — what a skill is (a procedure Claude loads and follows); the catalog grouped by
   purpose: process (brainstorming, debugging, planning), implementation, project-continuity
   (resume-project, session-handoff), verification; how skills are invoked and how they compose.
3. **Agents** — what a subagent is (a fresh-context specialist worker); the 13 specialists by role;
   the orchestrator-vs-worker model and delegation discipline (main thread routes, subagents do).
4. **Rules** — CLAUDE.md plus the rule hierarchy (`rules/common`, `rules/typescript`); how rules are
   always-on constraints, how they load, and how precedence/override works.
5. **Hooks** — the automated reflexes: a lifecycle-event → script map (SessionStart, PreToolUse,
   PostToolUse, Stop, Notification) showing which of the scripts fire when and what each guards
   (secret-scanner, block-destructive-bash, graphify-refresh, etc.).
6. **Plugins & Integrations** — what a plugin is and what MCP (Model Context Protocol — a standard
   that lets Claude talk to external tools/services) is; the enabled plugins + MCP servers; and the
   cross-cutting systems (memory, continuity-ledger, graphify knowledge graph, tool-routing).
7. **The Feature Pipeline** (centerpiece) — a generic feature traced end-to-end through the whole
   machine, with hooks and rules annotated at each step (see below).

## The feature-pipeline narrative

A swimlane/flow view tracing a generic "build feature X" request through the configured machine:

```
request
  → skill-check (using-superpowers)
  → brainstorming (design + spec)
  → writing-plans (implementation plan)
  → dispatch: subagent-driven-development / dispatching-parallel-agents
  → implement (implementer agent, TDD gate from testing.md)
  → review: code-reviewer (+ security-reviewer on security diffs)
  → verification-before-completion / verify-<project>
  → commit (commit-commands, git/commits.md)
  → session-handoff + continuity-ledger
```

At each step the view annotates:
- **Hooks that fire** (e.g. secret-scanner + protect-claude-config on Edit/Write; lint-on-edit on
  PostToolUse; graphify-refresh on Stop).
- **Rules that constrain** (e.g. no-comments, delegation-discipline, no-direct-db-access).

The narrative scaffolding lives in `references/pipeline-narrative.md` and is reconciled against the
live inventory at synthesis time so it never references a skill/agent that no longer exists.

## Modes & invocation

- `explain-my-config` (no arg) → full overview hub (all 7 tabs).
- `explain-my-config <area>` → focused deep-dive on one subsystem or flow, reading full file bodies
  for that slice only. `<area>` is a closed enum of global-config areas: `skills`, `agents`, `rules`,
  `hooks`, `plugins`, `mcp`, `pipeline`, `settings`, `memory`, `ledger`.
- **Argument handling is part of the scope guard.** A path-like, URL-like, or project/repo-targeting
  argument (anything not in the enum) is rejected per "Scope guard" — NOT silently treated as an
  area. A bare unrecognized word that is clearly an area typo may fall back to overview with a note;
  anything resembling an out-of-scope target is refused outright.

Deep drill-down mode MAY fan out parallel subagents (one per file/group) since it reads full bodies;
the overview never needs that.

## Jargon handling

Every technical term gets a hover tooltip with a one-line plain-language definition on first
appearance (hook, MCP, subagent, frontmatter, lifecycle event, orchestrator, marketplace, …). A
canonical set lives in `references/glossary.md`; the synthesis step pulls from it.

## Observations scope (explain-first, light)

A single clearly-labeled "Things to notice" block per relevant tab: overlaps (e.g. two skills with
similar purpose), apparently-unused pieces (an agent never referenced by any rule/skill), or notable
gaps. It describes; it never prescribes a fix. A one-line pointer suggests which other skill would
make the change.

## Output artifact

- File: `claude-config-explained.html` (single self-contained file), written to the working
  directory (or `~/.claude/docs/` by default if run from elsewhere).
- Opening it in a browser is the consumption step.

## Skill file structure

```
~/.claude/skills/explain-my-config/
  SKILL.md                      # the orchestration: audit → synthesize → render; modes
  scripts/
    audit-config.sh             # emits the structured JSON inventory of the live config
  references/
    content-model.md            # the 7-group structure + what each tab explains
    pipeline-narrative.md       # canonical feature-pipeline steps + hooks/rules per step
    glossary.md                 # canonical plain-language definitions for jargon terms
```

## Dependencies

- **visual-explainer** skill (enabled) — the renderer.
- Standard shell tools for the audit script (`find`, `ls`, `python3`/`jq` for JSON assembly).
- No network, no database, no cloud surface (honors no-direct-db-access).

## Verification approach

Light, per the testing gate (this is a content-generation tool, not a public API):

- Smoke check: `audit-config.sh` runs without error and emits valid JSON with the expected
  top-level keys (skills, agents, rules, hooks, plugins, mcp, settings).
- Accuracy spot-check: counts in the rendered Overview match the live config (e.g. number of agent
  files equals agents in the hub).
- Open the HTML; confirm tabs render, tooltips appear, and the pipeline view is present.

No mandated unit-test suite; a single smoke test for the script's JSON contract is optional.

## Risks & mitigations

- **Scaffolding drift** (pipeline-narrative/glossary referencing pieces that no longer exist) →
  reconcile against the live inventory at synthesis; only assert what the inventory confirms.
- **Token cost on deep dives** (reading many full bodies) → overview reads only frontmatter; deep
  mode is scoped to one area and may parallelize.
- **Plugin path fragility** (versioned cache paths like `.../5.1.0/...`) → the audit script globs
  versions rather than hardcoding them.
- **visual-explainer output size** → keep the content spec chunked per tab so the renderer stays
  within a single manageable file.

## Open questions

None blocking. Name confirmed (`explain-my-config`); architecture confirmed (A1); scope confirmed
(explain-first + light observations); output confirmed (single interactive HTML hub); target
hard-pinned to `~/.claude` with explicit rejection of any other repo/project/path (scope guard).
