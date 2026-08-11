# Graphify Integration + Agent-Suite Redesign — Ready-to-Apply Artifacts (2026-06-15, regenerated)

Apply target: the write-protected `~/.claude` config. You paste each block; nothing here is auto-applied.

This doc folds in BOTH locked designs:
- PART A — Graphify always-on integration, corrected per the deep-dive. Basis: decisions `2026-06-15-graphify-always-on-active`, `-graphify-deepdive-corrections` (supersedes `-graphify-edit-refresh` and `-graphify-streamlined-architecture`), `-commit-cadence`, `-lookup-shared-rule`. Canonical visual: `/Users/satanshumishra/.agent/diagrams/graphify-integration-deepdive.html`.
- PART B — Agent-suite ground-up redesign. Canonical source: `docs/superpowers/specs/2026-06-15-agent-suite-redesign.md` (decision `2026-06-15-agent-suite-redesign`).

Pin: `graphifyy==0.8.39` (PyPI; requires Python >= 3.10; repo github.com/safishamsi/graphify).

Legend: `[DEFAULT]` = recommended default applied below. `[CONFIRM]` = verify against the installed CLI / loader before relying on it. Forks are listed in "Decision points" at the end.

What changed vs the prior (12:59) draft of this doc:
- Edit-refresh is now a Stop hook (async + detached + mtime-guard), NOT PostToolUse(Edit) — subagent edits would slip past PostToolUse; Stop fires once per turn and catches all.
- State marker is `graphify-out/graph.json` (honor `$GRAPHIFY_OUT`), NOT `.graphify/`.
- The `watch` daemon is dropped (full-corpus rebuild + SessionEnd orphan risk).
- git-workflow.md is split hub-and-spoke (was a monolith insert).
- graph-scout is NOT built (the deep-dive proposed it; the later agent-suite redesign reversed that — its capability is merged into `codebase-analyst`, which becomes the primary locator).
- PART B (the full agent-suite re-tier + 4 new agents) is added.

---

# PART A — Graphify integration

## A1. Install (run once, human-operated)

[DEFAULT] pipx — isolated global CLI on PATH, pinned:

```
pipx install graphifyy==0.8.39
graphify --version
```

Alternatives if you prefer: `pip install --user graphifyy==0.8.39` or `uv tool install graphifyy==0.8.39`.

[RESOLVED 2026-06-15 against installed 0.8.39 — decision `2026-06-15-graphify-cli-reconciliation`]:
- There is NO `build` subcommand. `update <path>` builds the graph from scratch (AST-only, no LLM, no API key, exit 0) and is ALSO the incremental refresh; `extract <path>` is the semantic (LLM) build, used by neither hook. There is NO `prs` subcommand. Read commands are `query`, `path`, `explain`, `affected` (the `watch` daemon is intentionally NOT used).
- State marker is `graphify-out/graph.json`; the output dir IS overridable via `$GRAPHIFY_OUT` (source: `os.environ.get("GRAPHIFY_OUT", "graphify-out")`).
- `update` / `extract` both accept a project-root path argument and write `<path>/graphify-out/`.

---

## A2. rules/common/tool-routing.md — full replacement

Replace the entire file with:

```markdown
# Tool Routing — Map, GPS, Street View

Three read layers are available; pick by what the question needs. Default to orienting on the map, then drilling with the precise tools. Do not default to one layer exclusively.

## The three layers

- **graphify = the map.** A knowledge graph of the project (modules, symbols, relationships, communities). Use it to ORIENT: where does X live, what clusters with it, how do modules and data flow connect, where are the entry points. `graphify query "..."`, `graphify path A B`, `graphify explain <node>`. Built and kept fresh automatically (SessionStart build + a once-per-turn Stop-hook refresh); querying it is read-only and, for code, token-free.
- **Serena = GPS.** Precise, live symbol navigation. Use it to DRILL once the map has placed you: `find_referencing_symbols` (every usage), `find_implementations` (overrides/extends), `get_symbols_overview` (symbol map of one file), `find_symbol`, and `rename_symbol` / `replace_symbol_body` for symbol-targeted edits in large files. Serena reflects the code as it is now.
- **native grep / Read / Glob = street view.** Plain text or regex over a known location, small files, logs, config, generated output. Use when you already know where to look.

## Routing

1. **Orient on the map.** Start with graphify for "how does this fit together / where is X / what connects to Y" in a large or unfamiliar codebase.
2. **Drill with Serena** for precise relational facts (every caller, every implementation) and for symbol-targeted edits in large files.
3. **Grep / Read** for local, known-location, plain-text work.

The order is a heuristic, not a law: for a known identifier, grep is the correct first call; for a concept, semantic/LSP. Skip straight to street view when you already know the file and location — orientation is for when you do not.

## Safety rail (the map can lag the diff)

The graph reflects the last build. The Stop-hook refresh shrinks the gap to one turn, but it is not instantaneous, and the map is structural, not a live symbol index. So:

- For files edited since the last refresh, or whenever you need EXACT CURRENT symbol facts (precise call sites, signatures, definitions), verify with Serena / LSP rather than trusting the map.
- This is diff-local: only the just-edited files are suspect, not the whole graph. Verify the recent diff and genuinely-live precise queries; do not re-verify everything. Derived artifacts are hints; the code wins.

## Lookup vs evaluation

"Lookup" (orientation / locate / verify) is exactly this routing, followed by every tool-equipped agent — there is no separate lookup agent. For broad or expensive read-only sweeps, dispatch `codebase-analyst`: it is the primary locator and relational mapper. The built-in `Explore` is a last-resort fan-out only, after `codebase-analyst`. Evaluative agents (`code-reviewer`, `security-reviewer`, `debugger`) and the fact-check skill CONSUME lookup; they are not lookup agents.

## Setup

- graphify is provisioned per project at SessionStart (built if absent, refreshed for non-git projects) and kept fresh once per turn by a Stop hook. If `graphify query` reports no graph yet, a build is in flight — fall back to Serena / native until it lands.
- On first use of Serena in a project, call `activate_project` (or onboarding) once so its language servers index the repo.

## Precedence

For code mutations, rules/common/delegation-discipline.md supersedes this file: the main thread dispatches a subagent even for a small edit. The routing above governs the orchestrator's own reads and judgment artifacts, and every subagent's reads.

Rationale: the map wins for orientation in a large or unfamiliar codebase; Serena wins for precise / live relational facts and symbol edits; native wins on latency for local known work. graphify is local and token-free for code; Serena usage is recorded in its dashboard (localhost:24282) for periodic review.
```

Also update `CLAUDE.md` line 11 — see A4.

---

## A3. git-workflow.md — split hub-and-spoke

The deep-dive splits the monolithic `git-workflow.md` into a thin always-on hub plus on-demand spokes, and folds in the commit-cadence rules (decision `2026-06-15-commit-cadence`). The hub points to each spoke by path so they are discoverable on demand regardless of whether the rules loader recurses.

[CONFIRM] The rules loader appears to glob `rules/common/*.md` non-recursively (all flat common files load each turn; the `rules/typescript/` subdir does not). If so, the `rules/common/git/` spokes below load on-demand (the intended context savings). If the loader turns out to recurse, the spokes simply auto-load too — the split still functions because the hub references them explicitly. If you would rather guarantee always-load, rename the spokes to flat siblings (`git-commits.md`, `git-pull-requests.md`, `git-branching.md`) and keep the hub pointers.

### A3a. rules/common/git-workflow.md — full replacement (the hub)

```markdown
# Git Workflow (hub)

The orchestrating workflow. Detail lives in the spokes — read the relevant one on demand:
- Commit message format + cadence: `rules/common/git/commits.md`
- Pull request workflow: `rules/common/git/pull-requests.md`
- Branching: `rules/common/git/branching.md`

Attribution is disabled globally via `~/.claude/settings.json`; never add AI co-author attribution.
Commits and pushes happen only when the user asks. Destructive git operations require explicit confirmation.

## Feature Implementation Workflow

1. **Plan first.** Use the planning skills (`solution-architect` for the approach, `writing-plans` for the plan). Identify dependencies and risks; break into phases.
2. **TDD (scoped).** Apply the test admission gate (`rules/common/testing.md`). For gated changes: red, then green, then refactor. Verify diff-scoped via `/verify-<project>`.
3. **Code review.** Dispatch `code-reviewer` (+ `security-reviewer` in parallel on security-relevant diffs) immediately after writing code. Address CRITICAL and HIGH; fix MEDIUM when possible.
4. **Commit and push.** Shape work per `git/commits.md`; open PRs per `git/pull-requests.md`. Only when the user asks.
```

### A3b. rules/common/git/commits.md — NEW spoke

````markdown
# Commits (form + cadence)

## Message format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci. Conventional Commits for the published / squashed commit. No AI co-author attribution (disabled globally).

## Cadence

- **Atomic commits.** One logical change per commit. Separate refactor commits from behavior-change commits — never mix a rename or move with a behavior change.
- **Commit often, perfect later.** On the working branch, commit small increments freely (WIP is fine); squash-on-merge so the published history is clean. Keep Conventional Commits format for the squashed commit.
- **Small diffs.** Target ~200-400 LOC per reviewable change; review effectiveness drops sharply above that (SmartBear/Cisco code-review study; Google ~100-line CLs; DORA "work in small batches").
- This does NOT change the rule that commits and pushes happen only when the user asks. It governs how work is shaped into commits when they do.
````

(Note: to add inline source URLs per the research-citations discipline, say so and I will add them.)

### A3c. rules/common/git/pull-requests.md — NEW spoke

```markdown
# Pull Requests

When creating PRs:
1. Analyze the full commit history (not just the latest commit).
2. Use `git diff <base-branch>...HEAD` to see all changes.
3. Draft a comprehensive PR summary.
4. Include a test plan with TODOs.
5. Push with `-u` when the branch is new.

Use the `gh` CLI for GitHub operations. No AI co-author attribution. Open PRs only when the user asks.
```

### A3d. rules/common/git/branching.md — NEW spoke

```markdown
# Branching

- **Never commit straight to the default branch.** If on the default branch and a change is needed, create a branch first.
- **One branch per logical line of work**, named for it (e.g. `feat/...`, `fix/...`).
- **Squash-on-merge** is the integration default (keeps published history atomic; see `git/commits.md`).
- Destructive branch operations (force-push, branch deletion, history rewrite) require explicit user confirmation.
```

---

## A4. CLAUDE.md — line 11 (tool-routing invariant)

Replace:

```
- Choose tools by scenario: native for quick/local, Serena for relational/large-codebase. ~/.claude/rules/common/tool-routing.md
```

With:

```
- Choose tools by scenario: graphify knowledge-graph to orient/map, Serena for precise & relational symbol nav, native grep/Read for local/quick. ~/.claude/rules/common/tool-routing.md
```

(The git-workflow reference, if any elsewhere, still resolves: the hub stays at `rules/common/git-workflow.md`.)

---

## A5. settings.json — three changes

### A5a. permissions.allow — add these entries to the existing `allow` array

```
"Bash(graphify query:*)",
"Bash(graphify path:*)",
"Bash(graphify explain:*)",
"Bash(graphify affected:*)",
"Bash(graphify update:*)"
```

(Read/lookup + manual refresh. The hooks call graphify directly as shell commands and do not need allow-entries.)

### A5b. SessionStart — add a third hook to the existing SessionStart hooks array

```
{
  "type": "command",
  "command": "/Users/satanshumishra/.claude/hooks/graphify-provision.sh",
  "timeout": 15
}
```

(The script backgrounds the build and returns immediately, so the 15s timeout is safe even on a large initial build.)

### A5c. Stop — add a Stop hook (REPLACES the prior PostToolUse(Edit) graphify-update hook)

Add to the `Stop` hooks array (create it if absent). If you applied an earlier draft that registered a PostToolUse `graphify-update.sh`, REMOVE that entry.

```
{
  "type": "command",
  "command": "/Users/satanshumishra/.claude/hooks/graphify-refresh.sh",
  "timeout": 10
}
```

(The script self-detaches via nohup and returns instantly, so it never blocks turn end. Stop fires once per turn and catches edits made inside subagents, which a PostToolUse(Edit) matcher on the main thread would miss.)

---

## A6. hooks/graphify-provision.sh — NEW file (chmod +x)

[DEFAULT] SessionStart provisioner. Backgrounds an initial build if the graph is absent; refreshes non-git projects. No-op and safe if graphify is not installed. Marker is `graphify-out/graph.json`, honoring `$GRAPHIFY_OUT`. Uses `graphify update` (there is no `build` subcommand); `update` bootstraps from scratch AST-only with no API key, so always-on provisioning never fails for lack of a key.

```bash
#!/usr/bin/env bash
set -euo pipefail

command -v graphify >/dev/null 2>&1 || exit 0

root="$(pwd)"
out="${GRAPHIFY_OUT:-${root}/graphify-out}"
graph="${out}/graph.json"
log="${TMPDIR:-/tmp}/graphify-provision.log"

if [ -e "$graph" ]; then
  if [ ! -d "${root}/.git" ]; then
    nohup graphify update "$root" >>"$log" 2>&1 &
  fi
else
  nohup graphify update "$root" >>"$log" 2>&1 &
fi

exit 0
```

---

## A7. hooks/graphify-refresh.sh — NEW file (chmod +x) [replaces the old graphify-update.sh]

[DEFAULT] Stop-hook edit-refresh: async + detached + mtime-guard. Fires once per turn. Rebuilds only when a source file is newer than the last graph (the mtime-guard), so idle turns cost nothing. No-op if graphify is absent or the project has no graph yet. `update` is token-free for code, but its wall-clock floor (global Leiden + full serialize) scales with graph size, so the detach is mandatory.

```bash
#!/usr/bin/env bash
set -euo pipefail

command -v graphify >/dev/null 2>&1 || exit 0

root="$(pwd)"
out="${GRAPHIFY_OUT:-${root}/graphify-out}"
graph="${out}/graph.json"
log="${TMPDIR:-/tmp}/graphify-refresh.log"

[ -e "$graph" ] || exit 0

newer="$(find "$root" -type f \
  -not -path '*/graphify-out/*' \
  -not -path '*/.git/*' \
  -not -path '*/node_modules/*' \
  -not -path '*/.venv/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*' \
  -newer "$graph" -print -quit 2>/dev/null || true)"

[ -n "$newer" ] || exit 0

nohup graphify update "$root" >>"$log" 2>&1 &
exit 0
```

[CONFIRM] the exclude set matches your projects' generated/vendored dirs; add any others (`target/`, `.next/`, `out/`) as needed.

---

# PART B — Agent-suite redesign

Canonical source for rationale and full per-agent fields: `docs/superpowers/specs/2026-06-15-agent-suite-redesign.md`. This part is the paste-ready application of that spec. Tiering law: reasoning-demand x cost-of-miss; Opus is only ~1.67x Sonnet, so the burden of proof is on tiering down.

## B1. Model re-tiering — frontmatter deltas

Only two frontmatter `model:` lines change:

- `agents/debugger.md`: change `model: sonnet` to `model: opus` (diagnosis is reasoning; a wrong root cause ships a bad fix silently).
- `agents/implementer.md`: change `model: sonnet` to `model: inherit` (resolves to Opus in Opus sessions; the main loop is always Opus, so this lands on Opus and needs no `implementer-hardened` variant).

No other agent's `model:` line changes. `verification-strategist` stays Sonnet (its auth-escalation heuristic is real reasoning, not a lookup). `test-engineer` frontmatter stays Sonnet; its Opus escalation is a dispatch-time override (B4).

## B2. agents/codebase-analyst.md — graphify-aware + primary locator (the intersection of both designs)

`Bash` is already in its tools (no tools-line change). Three edits:

### B2a. Replace the `description:` frontmatter line

From:
```
description: Read-only relational and architectural mapping of a codebase. Use proactively before planning or implementing in a large or unfamiliar project, or when you need to know how modules, symbols, and data flow connect. Returns a distilled map, not file dumps. Never edits.
```
To:
```
description: Read-only relational and architectural mapping plus primary code location. Use proactively before planning or implementing, to find where something lives, and to map how modules, symbols, and data flow connect. The primary locator - prefer it over the built-in Explore. Returns a distilled map, not file dumps. Never edits.
```

### B2b. Replace the `## Lane` paragraph

From:
```
You map what exists (structure, relationships, conventions). `solution-architect` evaluates what to build. You supply the terrain; the architect chooses the route.
```
To:
```
You are the primary locator and comprehension agent - prefer you over the built-in `Explore`. You own plain code-location and relational mapping in one loop (the work a separate scout would have split off). You map what exists (structure, relationships, conventions); `solution-architect` evaluates what to build. You supply the terrain; the architect chooses the route.
```

### B2c. Replace step 1 under `## How you work`

From:
```
1. Start native (Glob/Grep/Read) to find entry points and orient. Escalate to Serena for relational questions: `find_referencing_symbols` (every usage), `find_implementations` (what overrides/extends), `get_symbols_overview` (symbol-level map of a file), `find_symbol`.
```
To:
```
1. Orient on the map first when graphify is provisioned (`graphify-out/graph.json` present): `graphify query` / `path` / `explain` to place the question - modules, clusters, relationships, entry points. Then drill with Serena for precise relational facts: `find_referencing_symbols` (every usage), `find_implementations` (overrides/extends), `get_symbols_overview` (symbol-level map of a file), `find_symbol`. Drop to native (Glob/Grep/Read) for local, known-location reads. The order is a heuristic - for a known identifier, grep first; for a concept, semantic/LSP. If the map lags a just-edited file, trust Serena/LSP over the map for that file.
```

## B3. agents/code-reviewer.md — add the a11y lens

### B3a. Replace the `description:` frontmatter line

From:
```
description: Expert code reviewer for correctness, quality, and maintainability. Use proactively immediately after code is written or modified, and for split-role deep review of a diff. Read-only; reports severity-ranked findings against the project's standards and never edits.
```
To:
```
description: Expert code reviewer for correctness, quality, maintainability, and accessibility of UI diffs. Use proactively immediately after code is written or modified, and for split-role deep review of a diff. Read-only; reports severity-ranked findings against the project's standards and never edits.
```

### B3b. Add an a11y bullet under `## Review against THESE standards`

Insert after the Tests bullet:
```
- Accessibility (a11y) for UI diffs (`*.tsx/jsx/vue/svelte`): semantic elements over div-soup, keyboard reachability, labels/alt text, ARIA correctness, and color-contrast intent. Design-time a11y is owned by the `ui-ux-baseline` skill, not this agent.
```

## B4. agents/test-engineer.md — Opus-escalation note (frontmatter unchanged)

Keep `model: sonnet`. The escalation is an orchestrator dispatch-time override: dispatch `test-engineer` with `model: opus` for any public-contract, authorization, or invariant boundary (a weak-but-green test there manufactures false trust with near-zero detectability). [DEFAULT] also add one line to the agent body so it self-flags such territory — insert under `## Lane`:

```
For tests on a public contract, an authorization boundary, or a core invariant, you reason at the highest tier (the orchestrator dispatches you with Opus); a green-but-weak test on those surfaces is worse than no test.
```

## B5. Unchanged core agents (confirm only — no edits)

`solution-architect` (opus), `security-reviewer` (opus), `mechanical-editor` (haiku), `verification-strategist` (sonnet) are already correct per the spec. Confirm none carries a `memory:` field (statelessness law) and that advisor agents have no `Edit`/`Write`.

## B6. agents/performance-engineer.md — NEW file

```markdown
---
name: performance-engineer
description: Performance specialist. Use when latency, throughput, or memory must be measured and improved. Profiles, optimizes, and re-measures in one loop. Reports baseline and measured delta with evidence; never claims a speedup it did not measure.
tools: Read, Edit, Write, Bash, Grep, Glob, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__get_symbols_overview
model: opus
color: red
---

You make code measurably faster and prove it with before/after numbers. The loop is one agent's job: profiling, the change, and re-measurement share context and must not be split across dispatches.

## Lane
You own the measure -> optimize -> re-measure loop. A pure algorithmic-approach decision belongs to `solution-architect`; rote edits belong to `mechanical-editor`; an unknown-cause slowdown that is really a defect belongs to `debugger`.

## How you work
1. Establish a baseline: profile or benchmark the hot path with the project's tools and record the numbers before changing anything.
2. Form a hypothesis from the profile (the data, not a guess), and change only what the profile implicates.
3. Re-measure under the same conditions. Keep the change only if the delta is real; revert it if it is not.
4. Return: baseline, change (file:line), re-measured result, and the exact commands that produced both numbers. Background any profiling/benchmark run expected to exceed ~60s.

## Rules you enforce (the project's standards)
- Immutability; no comments; small cohesive files; comprehensive error handling; input validation at boundaries; no hardcoded values.
- No speculative optimization: every change traces to a measurement.

## Do NOT
- Claim a speedup without before/after numbers from the same conditions.
- Carry a scope beyond the measured hot path, or refactor unrelated code.
- Commit, push, or run destructive git/shell operations unless instructed.
- Connect to any database or cloud-admin surface (no-direct-db-access).
- Spawn other subagents.
```

## B7. agents/technical-writer.md — NEW file

```markdown
---
name: technical-writer
description: Documentation specialist. Use for READMEs, ADRs, changelogs, and docs. Writes accurate prose grounded in the actual code, fenced to Markdown and docs. Cites a verifiable source for every external claim.
tools: Read, Edit, Write, Grep, Glob, WebFetch
model: sonnet
color: cyan
---

You write documentation that matches what the code actually does. You are fenced to a disjoint scope, so you can run safely alongside code work.

## Lane
You author and edit documentation only. Code changes belong to `implementer`; the design decisions you document come from `solution-architect` and the planning skills. You do not change behavior.

## Scope fence
You write ONLY Markdown and docs: `*.md`, `docs/`, README/CHANGELOG/ADR files. Never edit source, config, or build files. This disjoint scope is what lets you run in parallel with a code agent.

## How you work
1. Read the code and any existing docs first; document what is true now, not what a stale comment or ledger note claims.
2. For each external or factual claim (a framework behavior, an API contract, a "best practice"), cite a verifiable source URL inline; mark `[unverified]` when you cannot find one. Never fabricate a citation.
3. Match the surrounding docs' structure and voice. Keep it concise; link rather than duplicate.
4. Return what changed (file:line) and the sources used.

## Do NOT
- Edit source, test, config, or build files (only `*.md` / `docs/`).
- Author code comments (the no-comments rule still applies to code).
- Fabricate citations, metrics, or behavior the code does not show.
- Use emojis unless explicitly requested.
- Commit or touch git unless instructed.
- Connect to any database (no-direct-db-access).
- Spawn other subagents.
```

## B8. agents/devops-engineer.md — NEW file

```markdown
---
name: devops-engineer
description: CI/CD and infrastructure-as-code authoring specialist. Use to write or change pipeline, deploy, and IaC config. Authors static artifacts only; never connects to a live cloud or runs a deploy. A human applies the change.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
color: orange
---

You author CI/CD pipelines and infrastructure-as-code as static files. You never touch a live environment; the human operates the live system, exactly as for databases.

## Lane
You author pipeline/IaC/config files. Application code belongs to `implementer`. Anything that authenticates to or mutates a live cloud is a human action, never yours.

## Scope fence
You write CI/IaC/config files: `.github/`, CI configs, `*.yml`/`*.yaml`, `*.tf`, Dockerfiles, deploy manifests. Bash is for LOCAL STATIC validation only (lint, `validate`, dry-run/`plan`); never `apply`, `deploy`, `push`, or any command that authenticates to a cloud/admin surface.

## How you work
1. Read the existing pipeline/IaC and match its conventions.
2. Make the change as static config; keep secrets as env / secret-manager references, never inline.
3. Validate locally where a static validator exists (lint/validate/plan) and report its output.
4. Return what changed (file:line), the validation output, and the exact human step needed to apply it.

## Do NOT
- Connect to, authenticate to, or mutate any live cloud, cluster, or admin surface (extends no-direct-db-access to all cloud-admin planes).
- Run apply/deploy/push or anything that changes a live environment.
- Hardcode secrets.
- Commit or touch git unless instructed.
- Spawn other subagents.
```

## B9. agents/data-engineer.md — NEW file

```markdown
---
name: data-engineer
description: Schema and migration authoring specialist. Use to design schemas and write migration SQL (and paired rollbacks). Authors .sql files only; never connects to or queries a live database. A human runs the SQL in the dashboard.
tools: Read, Edit, Write, Grep, Glob, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__get_symbols_overview
model: opus
color: magenta
---

You design schemas and author migration SQL as static files. Schema design is load-bearing and hard to reverse, so it gets careful reasoning. You never connect to a database; the human applies every migration.

## Lane
You author schema/migration artifacts. ORM or application code that follows a migration belongs to `implementer`. Operating the live database is a human action, never yours.

## Scope fence
You write migration files in the project's convention (e.g. `supabase/migrations/YYYYMMDD_<desc>.sql`) and a paired rollback when the project requires one. Never connect to, query, or apply against a live DB.

## How you work
1. Read the current schema artifacts (committed SQL, generated types, schema dumps) and match the project's migration convention.
2. Author the forward migration and its rollback as static .sql; use parameterized, safe DDL/DML.
3. When you need live data to reason (row counts, query plans), WRITE the EXPLAIN/SELECT into the file or a code block for the human to run and paste back; do not run it yourself.
4. Return the migration path(s), what they change, and the exact human step to apply (paste into the dashboard).

## Do NOT
- Connect to, query, or apply anything against a live database (no-direct-db-access, hard rule).
- Author destructive DDL without a paired rollback and an explicit callout.
- Hardcode secrets or connection strings.
- Commit or touch git unless instructed.
- Spawn other subagents.
```

## B10. Built-in agent handling (no editable prompt files)

- **Explore** — demoted to last-resort. Mechanism: the `tool-routing.md` "Lookup vs evaluation" section (A2) and `codebase-analyst`'s description (B2a) make the analyst the primary locator. [OPTIONAL, not default] in sessions where the analyst must own search, add `"Agent(Explore)"` to `permissions.deny` in settings; left off by default since Explore remains a valid last resort.
- **Plan** — deprecated in favor of `solution-architect` + the `writing-plans` skill. Usage recommendation only; nothing to paste.
- **general-purpose** — retained as the genuine catch-all of last resort (open-ended work with no specialist). Not a default for any SDLC task.
- **Accessibility (a11y)** — no agent. Diff-time a11y is the `code-reviewer` lens (B3); design-time a11y is the existing `ui-ux-baseline` skill.

---

# Cross-design notes

- The single point where both designs meet is `codebase-analyst` (B2): it gains graphify-awareness (PART A) and the primary-locator role (PART B) in the same edits. PART A's `tool-routing.md` "Lookup vs evaluation" section assumes B2 is applied.
- Statelessness law (spec L5): no agent gets a `memory:` field, reviewers least of all. The existing `agents-stateless-no-memory` memory protects this.
- Routing matrix for all SDLC tasks lives in the spec; deps route to `mechanical-editor` + `verification-strategist` (rote) / `implementer` (breaking) / `security-reviewer` (vuln); docs to `technical-writer`; open-ended research to the `deep-research` skill.

---

# Decision points (defaults applied above; change any and I will regenerate)

1. **Edit-refresh trigger** — [DEFAULT] Stop hook (A7), once per turn, mtime-guarded. No `watch` daemon. (Resolved per `-graphify-deepdive-corrections`.)
2. **State marker** — [DEFAULT] `graphify-out/graph.json`, honoring `$GRAPHIFY_OUT`.
3. **Install method** — [DEFAULT] pipx. Alternatives: pip --user, uv tool.
4. **git spokes location** — [DEFAULT] `rules/common/git/` subdir (on-demand spokes via hub pointers). Alternative: flat `rules/common/git-*.md` siblings to guarantee always-load. Tied to the loader-recursion [CONFIRM] in A3.
5. **Explore hard-deny** — [DEFAULT] off (description-level demotion only). Turn on per A5/B10 if you want the analyst to strictly own search.
6. **test-engineer Opus escalation** — [DEFAULT] dispatch-time override + self-flag body line (B4); frontmatter stays Sonnet.

# Still open (does not block applying the above)

- [CONFIRM] exact graphify 0.8.39 subcommand flags, the `graphify-out` path / `$GRAPHIFY_OUT` override, and the build/update path argument via `graphify --help` after install.
- [CONFIRM] the rules loader is non-recursive (determines whether the git spokes are on-demand or always-load; the split functions either way).
- Initial full-build wall-clock on project-swiftee and one other large downstream project (needs graphify installed; the provisioner backgrounds it regardless).
- deep-research config hygiene: the `deep-research` skill is live and routable (used 13x; present this session) but loads from the `everything-claude-code` marketplace, which is NOT in `enabledPlugins`. Routing works today; formally enabling the marketplace is an optional follow-up, out of scope here.
- `implementer-hardened` variant: not added (main loop is always Opus, so `inherit` lands on Opus). Revisit only if non-Opus sessions are introduced.