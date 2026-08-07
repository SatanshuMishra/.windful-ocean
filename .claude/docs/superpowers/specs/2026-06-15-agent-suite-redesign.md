# Agent Suite Redesign — Final Spec

Status: approved (design ratified 2026-06-15: "All recommendations above LOOK good"); this spec formalizes it for an implementation plan. Nothing in this spec is applied to `~/.claude` — every change is authored here and pasted by the human (the config tree is write-protected).

## Context

The installed `~/.claude/agents` suite (9 lean stateless agents from 2026-06-12-agent-suite-rework) leaks many SDLC tasks — performance, documentation, devops, dependency management, plain code-location — to the built-in `general-purpose` and `Explore` agents, which is the explicit anti-goal. A re-audit (5 parallel Opus research streams + one adversarial Opus red-team that read the installed files) settled a ground-up redesign. This spec captures the redesign at per-agent fidelity so an implementation plan can be written against it.

Canonical sources this spec is derived from:
- `/Users/satanshumishra/.agent/diagrams/agent-suite-redesign.html` — the ratified design (posture, design laws, gaps/overlaps, tiering framework, scout verdict, per-agent change list).
- `projects/-Users-satanshumishra--claude/ledger/decisions/2026-06-15-agent-suite-redesign.md` — the ratified decision record.
- Current state: the 9 files in `agents/*.md`; lane vocabulary from `rules/common/tool-routing.md` and `rules/common/delegation-discipline.md`.

## Research basis (condensed; full citations in the visual + session research)

- Mimic engineering functions, not the org chart — gains come from Programmer/Reviewer/Tester roles; figurehead personas (CEO/CPO/CTO) have no isolated empirical support. Orchestration is a mechanism (the main thread), never a persona.
- Tier by reasoning-demand x cost-of-miss, not by phase name. Cost-of-miss = blast-radius x (1 - detectability). Opus is only ~1.67x Sonnet, so the burden of proof is on tiering *down*, not up.
- Clean-context separation of decider from checker: review's bug-catching power comes from the reviewer not sharing the implementer's context. Reviewers run on fresh context, never fed the implementer's trace.
- One writer per file-scope; parallel only across disjoint fences. Parallel writers on shared state fragment coherence (Cognition; DeepMind decentralized error-amplification 17.2x vs 4.4x centralized). Safe concurrency = non-overlapping scope fences enforced at plan time. This matches the installed `parallel-subagent-development` engine.
- No persistent per-agent memory: it operationalizes confirmation bias, is a poisoning target (MINJA), and goes stale. The agents that sign off on correctness/security are exactly the ones that must not carry durable internal state.
- Read-only by default: analyze/review/audit agents get no Edit/Write. Overlapping or excessive tools degrade tool-selection; keep each roster lean (~8-12 tools).

## Decisions locked

1. Roster is 9 re-tiered core agents + 4 Tier-B agents (activated when the domain warrants). a11y is a `code-reviewer` lens, not an agent.
2. Model tier is routed on reasoning-demand x cost-of-miss, not on phase name.
3. `graph-scout` is NOT built; its locate+traverse capability is merged into `codebase-analyst`, which becomes the primary locator and displaces `Explore`.
4. `implementer` model = `inherit`. Main loop is always Opus 4.8 (confirmed 2026-06-15), so `inherit` resolves to Opus and NO `implementer-hardened` variant is added. Revisit only if non-Opus sessions are ever introduced.
5. Open-ended non-codebase research routes to the `deep-research` skill. It is confirmed live this session (available skill, 13 prior uses) though it loads from the `everything-claude-code` marketplace, which is NOT in `enabledPlugins`. Routing is safe today; the config-hygiene fix (formally enabling the marketplace) is tracked as a follow-up, out of scope for this spec.
6. The four red-team corrections are binding and must not be re-introduced as errors (see "Red-team corrections preserved").
7. Nothing is applied to `~/.claude`; the implementation plan produces files the human pastes.

## Design laws (underpin every agent below)

- L1 — Functions not personas. Agents are engineering functions; the main thread orchestrates.
- L2 — Tier on reasoning x cost-of-miss. Escalate to Opus where a miss is silent and high-blast-radius; tier down only where a wrong answer is caught by the deterministic tool the agent wraps.
- L3 — Decider != checker. Reviewers get fresh context; never fed the worker's trace. `code-reviewer` and `security-reviewer` run in parallel on the same diff.
- L4 — One writer per file-scope; parallel only across disjoint fences. The scope fence is injected into every write agent's prompt.
- L5 — Stateless agents. No `memory:` field on any agent, reviewers most of all.
- L6 — Read-only by default; lean tools. Advisor agents get no Edit/Write; keep tool lists minimal and non-overlapping.

## Model tiering framework

Tier = f(reasoning-demand, cost-of-miss). Two refinements bound it:

- Refinement 1 (escalate up): implementation CAN need Opus. On hard categories the tier gap is 2x+ and weak-model misses are disproportionately silent (hallucinated dependencies ~4x higher on weaker models). Escalate to Opus for concurrency, security-sensitive code, crypto, intricate algorithms, ambiguous specs. A plan does not protect against a race condition it never mentioned.
- Refinement 2 (tier down): scope-routing and mechanical verification sit on the critical path but are reasoning-free (a wrong answer is caught by the deterministic tool they wrap). Spending Opus there is over-provisioning. Caveat: `verification-strategist` is NOT one of these — its auth-escalation heuristic is real reasoning, so it stays Sonnet.

## The roster

Per-agent fields: model (+ reason), access (R = read-only, R/W = read-write), tools, description/when-to-use, lane boundary (the discriminator vs adjacent agents), scope fence. Tool lists marked `[spec-derived]` were not given by the design and are set here by analogy to existing agents under L6; all others are the exact installed/ratified lists.

### Core suite (9, always-on)

#### 1. codebase-analyst
- Model: Sonnet. Reason: highest-frequency agent; a miss is recoverable (deep reasoning escalates to `solution-architect`).
- Access: R.
- Tools: Read, Grep, Glob, Bash, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__find_implementations, mcp__plugin_serena_serena__get_symbols_overview, mcp__plugin_serena_serena__search_for_pattern, mcp__plugin_serena_serena__find_file, mcp__plugin_serena_serena__list_dir.
- Description: Read-only relational and architectural mapping plus primary code location. Locate + orient + relational map in one loop. Use proactively before planning or implementing in a large or unfamiliar project, or to find where something lives and how modules, symbols, and data flow connect. Returns a distilled map, not file dumps. Never edits. Absorbs the former graph-scout role: it is the primary locator, ahead of the built-in Explore.
- Search heuristic (soft, agent may override per step): graphify graph -> Serena/LSP -> grep. graphify is a tool the analyst calls (fast first-pass relational index); live LSP/grep is ground truth on conflict and on a stale/missing graph. For a known identifier, grep is the correct first call; for a concept, semantic/LSP.
- Lane boundary: Maps terrain; `solution-architect` picks the route. Locates and comprehends; does not decide approach or write code.
- Scope fence: n/a (read-only).

#### 2. solution-architect
- Model: Opus. Reason: highest reasoning; errors are one-way doors with low detectability.
- Access: R.
- Tools: Read, Grep, Glob, Bash, WebFetch, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__find_implementations, mcp__plugin_serena_serena__get_symbols_overview.
- Description: Read-only design analysis. Use when a non-trivial change needs an approach decided before coding — evaluates 2-3 viable options against trade-offs, grounded in the existing codebase, and recommends one. Produces analysis that feeds a plan; does not write code or author the plan itself.
- Lane boundary: Decides approach; does not author the plan (it cannot ask the user — the main thread + `writing-plans` own that). Owns the heavy architectural reasoning that `codebase-analyst` does not.
- Scope fence: n/a (read-only).

#### 3. code-reviewer
- Model: Opus. Reason: inspection catches 60-85% of defects vs <50% for testing; a missed defect re-enters the cost curve.
- Access: R.
- Tools: Read, Grep, Glob, Bash, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__find_implementations, mcp__plugin_serena_serena__get_symbols_overview.
- Description: Expert reviewer for correctness, quality, and maintainability. Use proactively immediately after code is written or modified, and for the split-role deep review of a diff. Read-only; reports severity-ranked findings against the project's standards; never edits. Owns an a11y lens for UI diffs (`*.tsx/jsx/vue/svelte`).
- Lane boundary: Judges correctness/quality/maintainability + a11y. Deep application-security threat analysis is `security-reviewer`; the two run in parallel on the same diff, neither reading the other's trace.
- Scope fence: n/a (read-only).

#### 4. security-reviewer
- Model: Opus. Reason: lowest detectability + highest blast radius.
- Access: R.
- Tools: Read, Grep, Glob, Bash, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__find_implementations, mcp__plugin_serena_serena__get_symbols_overview.
- Description: Application and code security reviewer. Use proactively on changes touching auth, input handling, data access, secrets, or external integrations, and for the security pass of a deep review. Read-only; threat-models the diff and reports severity-ranked vulnerabilities with concrete remediation; never edits.
- Lane boundary: Owns application security; general correctness/quality is `code-reviewer`. Runs in parallel with it on the same diff.
- Scope fence: n/a (read-only).

#### 5. verification-strategist
- Model: Sonnet. Reason: runs a real security-escalation heuristic (auth/middleware/shared-util touch -> widen scope) — reasoning with a high cost-of-miss, not a table lookup. Explicitly NOT Haiku (red-team fix).
- Access: R.
- Tools: Read, Grep, Glob, Bash.
- Description: Reads a git diff and the project's `/verify-<project>` routing table, then outputs the minimal verification scope. Use proactively before declaring work complete in projects with a scoped verify command. Returns JSON `{"scope": "...", "rationale": "..."}`.
- Cross-cutting heuristic (preserve verbatim in behavior): if any file under `lib/auth/`, `middleware.ts`, or shared utilities is touched, escalate the scope to include `"auth"` even if other paths did not directly match it.
- Lane boundary: Decides scope; the caller runs it.
- Scope fence: n/a (read-only).

#### 6. implementer
- Model: inherit (resolves to Opus in Opus sessions; main loop is always Opus). Reason: per-dispatch escalation had no enforcement surface; `inherit` is enforceable and lands on Opus today.
- Access: R/W.
- Tools: Read, Edit, Write, Bash, Grep, Glob, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__find_implementations, mcp__plugin_serena_serena__get_symbols_overview, mcp__plugin_serena_serena__replace_symbol_body, mcp__plugin_serena_serena__insert_after_symbol, mcp__plugin_serena_serena__insert_before_symbol.
- Description: Primary code worker. Use to implement a scoped feature, change, or fix against a clear spec or plan task under the project's coding standards. Writes and edits code; runs the narrowest checks to prove the change before returning.
- Lane boundary: For purely mechanical edits with no judgment -> `mechanical-editor`; for test-only work -> `test-engineer`; for diagnosing an unknown root cause -> `debugger`.
- Scope fence: carries the file-scope fence injected by the orchestrator. One writer per file-scope; parallel implementers operate only across disjoint fences.

#### 7. debugger
- Model: Opus (change from Sonnet). Reason: diagnosis is reasoning; a wrong root cause ships a bad fix silently (high cost-of-miss).
- Access: R/W.
- Tools: Read, Edit, Bash, Grep, Glob, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_implementations, mcp__plugin_serena_serena__get_symbols_overview.
- Description: Debugging specialist for bugs, test failures, and unexpected behavior. Use proactively when something is broken and the cause is unknown. Finds root cause via systematic investigation, applies the minimal fix, and proves it. Absorbs noisy logs and stack traces in its own context so they never reach the orchestrator.
- Lane boundary: debugger = cause UNKNOWN (diagnosis is the work); `implementer` = cause known, change scoped. If scope grows beyond the fix, hand back to `implementer`.
- Scope fence: minimal-fix fence — touches only what the diagnosed root cause requires.

#### 8. test-engineer
- Model: Sonnet, escalating to Opus for any public-contract, authorization, or invariant boundary (red-team fix: not only "security"). Reason: a weak-but-green test has near-zero detectability and manufactures false trust; contract/authz/invariant tests are as load-bearing as security tests.
- Access: R/W.
- Tools: Read, Edit, Write, Bash, Grep, Glob.
- Description: Test specialist. Use when the task is primarily about tests — adding coverage for existing untested behavior, building out a suite, or hardening weak tests. Applies the test admission gate strictly and asserts observable behavior through public surfaces. Runs the tests and reports real results.
- Lane boundary: Owns test-focused work. When a feature implementation includes its own TDD cycle, that is `implementer`; this agent is dispatched when tests themselves are the job.
- Scope fence: test files (and fixtures) for the targeted behavior.

#### 9. mechanical-editor
- Model: Haiku. Reason: zero design judgment; Opus here costs tokens for no gain. Its value rises now that `implementer` is Opus-by-inherit.
- Access: R/W.
- Tools: Read, Edit, Grep, Glob.
- Description: Cheap, fast worker for unambiguous mechanical edits against a precise spec — renames, signature updates, import-path changes, applying a known diff across files, rote refactors. Use when the change requires no design judgment. If the task is ambiguous, it stops and reports rather than guessing.
- Lane boundary: Rote deterministic edits with a clear spec only. Anything requiring judgment, new behavior, new files, or running commands -> `implementer`.
- Scope fence: the exact files/symbols named in the spec; no command execution.

### Tier-B suite (4, activated when the domain warrants)

#### 10. performance-engineer
- Model: Opus. Reason: performance analysis is reasoning; a wrong optimization can regress silently.
- Access: R/W.
- Tools `[spec-derived]`: Read, Edit, Write, Bash, Grep, Glob, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__find_referencing_symbols, mcp__plugin_serena_serena__get_symbols_overview.
- Description: Profile -> optimize -> re-measure in ONE loop (iterative, shared context — must not be split across dispatches). Use for latency/throughput/memory work where a measured baseline and a measured delta are required. Fills the performance gap previously leaking to general-purpose.
- Lane boundary: Owns the measure-change-remeasure loop. Pure algorithmic redesign decisions escalate to `solution-architect`; rote edits go to `mechanical-editor`.
- Scope fence: the hot-path files identified by its own profiling; carries the one-writer fence.

#### 11. technical-writer
- Model: Sonnet. Reason: prose authoring; low cost-of-miss, fenced to a disjoint scope so no code-coherence risk.
- Access: R/W.
- Tools `[spec-derived]`: Read, Edit, Write, Grep, Glob, WebFetch.
- Description: Authors READMEs, ADRs, changelogs, and docs. Replaces the phantom "docs skill" with a real fenced agent. WebFetch supports the research-citation discipline (verifiable source per external claim).
- Lane boundary: Documentation only. Code changes -> `implementer`; design decisions to be documented come from `solution-architect`/`writing-plans`.
- Scope fence: FENCED to `*.md` and `docs/`. A disjoint scope from code agents, so it may run in parallel with code work safely.

#### 12. devops-engineer
- Model: Sonnet. Reason: config authoring with bounded judgment; the hard no-live-cloud rule removes the highest-risk surface.
- Access: R/W.
- Tools `[spec-derived]`: Read, Edit, Write, Bash, Grep, Glob.
- Description: CI / deploy / IaC config authoring only. Never connects to a live cloud or admin/data plane (hard rule per `rules/common/no-direct-db-access.md` extended to cloud-admin surfaces); the human applies. Bash is for local static validation only (lint/validate/plan-dry-run), never for apply/deploy/auth-to-cloud.
- Lane boundary: Authors pipeline/IaC files; a human runs anything that touches a live environment.
- Scope fence: CI/IaC/config files (e.g. `.github/`, `*.yml`, `*.tf`, Dockerfiles); carries the one-writer fence; no live-cloud connection.

#### 13. data-engineer
- Model: Opus. Reason: schema design is load-bearing; a wrong migration is high-blast-radius and low-detectability.
- Access: R/W.
- Tools `[spec-derived]`: Read, Edit, Write, Grep, Glob, mcp__plugin_serena_serena__find_symbol, mcp__plugin_serena_serena__get_symbols_overview.
- Description: Authors `.sql` migration files (and paired rollbacks per project convention) only. Never connects to or queries a live database (hard rule per `rules/common/no-direct-db-access.md`); the human pastes and runs the SQL in the dashboard. For live-data inspection, it writes the EXPLAIN/SELECT into a file for the human to run and paste back.
- Lane boundary: Authors schema/migration artifacts; the human operates the live system. ORM/application code changes that follow a migration -> `implementer`.
- Scope fence: migration files under the project's migrations convention (e.g. `supabase/migrations/`); no DB connection; no command that authenticates to a live project.

## Tier changes (current on-disk -> redesign)

| Agent | Current | Redesign | Reason |
|---|---|---|---|
| codebase-analyst | Sonnet | Sonnet (+ absorbs graph-scout, becomes primary locator) | Highest-frequency; recoverable |
| solution-architect | Opus | Opus | One-way-door reasoning |
| code-reviewer | Opus | Opus (+ a11y lens) | Inspection high-impact |
| security-reviewer | Opus | Opus | Lowest detectability, highest blast radius |
| verification-strategist | Sonnet | Sonnet (NOT Haiku) | Auth-escalation heuristic is real reasoning |
| implementer | Sonnet | inherit (-> Opus today) | Enforceable tiering; lands on Opus |
| debugger | Sonnet | Opus | Diagnosis is reasoning; silent miss |
| test-engineer | Sonnet | Sonnet -> Opus on contract/authz/invariant | Weak-green tests manufacture false trust |
| mechanical-editor | Haiku | Haiku | Zero design judgment |
| performance-engineer | (new) | Opus | Perf analysis is reasoning |
| technical-writer | (new) | Sonnet | Fenced prose, low cost-of-miss |
| devops-engineer | (new) | Sonnet | Config authoring, no live cloud |
| data-engineer | (new) | Opus | Schema design is load-bearing |

## graph-scout verdict and codebase-analyst absorption

Do not build `graph-scout`; fold its capability into `codebase-analyst`. Each signature graph-scout choice was rejected:

- Separate locate-only agent -> rejected: locate + traverse are one loop; the graph's advantage shows at 2+ hops (the relational work scout omits); splitting forces a second dispatch for the inevitable "and how does it connect." Handoff losses > specialization gains.
- Haiku model -> rejected: query formulation, layer choice, and result triage are reasoning; small models degrade sharply (10-12 turns vs 3-4). Search is judgment. The cheap-small-model LocAgent result depended on fine-tuning not available here.
- Omit relational tools -> rejected: a read-only agent with `find_referencing_symbols` does no damage by also traversing; omission buys only tidiness at real latency/token cost.
- Rigid graph->semantic->grep order -> softened to a heuristic the agent may override per step, with fallthrough on a stale/missing graph.

Net: one strong, well-described analyst owns the whole comprehension job and makes `Explore`/`general-purpose` genuine last-resort better than a deliberately-incomplete scout would. graphify is a tool the analyst calls, with live LSP/grep as ground truth on conflict — consistent with "derived artifacts are hints; code wins."

## Built-in demotions and non-agent decisions

- Explore (built-in): demoted to last-resort. Mechanism: `codebase-analyst` wins delegation via a strong proactive description; optionally `permissions.deny: ["Agent(Explore)"]` in sessions where the analyst must own search.
- Plan (built-in): deprecated in favor of `solution-architect` + `writing-plans`; recommend not using it.
- general-purpose (built-in): retained but de-normalized to a genuine catch-all of last resort (open-ended work with no specialist). Not a default for any SDLC task.
- Accessibility (a11y): no new agent. Diff-time a11y -> `code-reviewer` lens for `*.tsx/jsx/vue/svelte`. Design-time a11y -> existing `ui-ux-baseline` (and `impeccable` if present) skills.

## Skill / capability routing matrix

| Task | Routed to |
|---|---|
| Requirements / spec | `brainstorming` skill (+ main thread) — interactive; subagents cannot ask the user |
| Architecture / design | `solution-architect` (Opus, R) |
| Implementation planning | `writing-plans` skill (+ main thread) — interactive |
| Implementation | `implementer` (inherit) |
| Mechanical edits | `mechanical-editor` (Haiku) |
| Testing | `test-engineer` (Sonnet -> Opus on contracts/authz/invariants) |
| Code review (quality) | `code-reviewer` (Opus) + a11y lens |
| Security review | `security-reviewer` (Opus) |
| Debugging | `debugger` (Opus) |
| Documentation | `technical-writer` (Sonnet, Tier-B) |
| Performance | `performance-engineer` (Opus, Tier-B) |
| Release / DevOps / IaC | `devops-engineer` (Sonnet, Tier-B) |
| Data / schema / migrations | `data-engineer` (Opus, Tier-B) |
| Dependency bumps (rote) | `mechanical-editor` + `verification-strategist` (+ existing dep-audit hook) |
| Dependency bumps (breaking) | `implementer` |
| Dependency vuln audit | `security-reviewer` |
| Open-ended non-codebase research | `deep-research` skill (live; see Decision 5) |
| Code search / locate / relational map | `codebase-analyst` (primary locator) |

## Red-team corrections preserved (do not re-introduce)

1. Write law: NOT "single write path." Correct law is "one writer per file-scope; parallel only across disjoint fences," matching the installed `parallel-subagent-development` engine. The fence is injected into every write agent's prompt.
2. No phantom skills: docs is a real fenced `technical-writer` agent (not a skill that falls to general-purpose); dependency bumps route to concrete owners (`mechanical-editor` + `verification-strategist`); open-ended research routes to the live `deep-research` skill.
3. `verification-strategist` stays Sonnet, not Haiku — its auth-escalation heuristic is reasoning with high cost-of-miss.
4. `test-engineer` Opus-escalation covers any public-contract / authz / invariant boundary, not only "security."

## Cross-cutting requirements

- Statelessness (L5): no `agent` carries a `memory:` field; this is asserted from `~/.claude/agents/*` and protected by the existing memory `agents-stateless-no-memory` note. Reviewers especially.
- Scope-fence injection (L4): write agents (`implementer`, `debugger`, `test-engineer`, `mechanical-editor`, `performance-engineer`, `technical-writer`, `devops-engineer`, `data-engineer`) receive a per-dispatch file-scope fence; the orchestrator guarantees disjoint fences for parallel writers.
- Read-only default (L6): advisor agents (`codebase-analyst`, `solution-architect`, `code-reviewer`, `security-reviewer`, `verification-strategist`) have no Edit/Write.
- Review separation (L3): `code-reviewer` and `security-reviewer` run in parallel on the same diff on fresh context, never fed the worker's trace.
- No-direct-DB/cloud (hard rule): `data-engineer` never connects to a DB; `devops-engineer` never connects to a live cloud. Both author static artifacts the human applies.

## Open items / deferred

- deep-research config hygiene: it loads from `everything-claude-code` (not in `enabledPlugins`). Routing works today; formally enabling the marketplace is a follow-up tracked in the graphify thread, out of scope here.
- graphify query interface: the exact subcommand `codebase-analyst`'s heuristic calls (and the `.graphify` marker path) is pending `graphify --help` post-install; tracked in the graphify apply-doc, not blocking this spec.
- implementer-hardened variant: not added (main loop is always Opus). Revisit only if non-Opus sessions are introduced.

## Verification plan (for the implementation phase)

`~/.claude` is not a git repo and has no test suite; verification is structural and static:
- Each `agents/*.md` parses with valid frontmatter and the model/tools/access this spec specifies (13 files total: 9 edited/confirmed + 4 new).
- No `agents/*.md` contains a `memory:` field.
- Advisor agents contain no `Edit`/`Write` in their tools; write agents do.
- Tool lists contain no duplicates and stay within the lean cap; MCP tool names resolve to installed Serena tools.
- Routing descriptions encode the discriminators (debugger=cause-unknown vs implementer; code-reviewer vs security-reviewer parallel; codebase-analyst as primary locator ahead of Explore).
- The `deep-research`, `technical-writer`, dependency-bump routings appear in whatever routing surface the apply-doc updates (descriptions and/or `tool-routing.md`).
- The human pastes each file; no file is written to `~/.claude` config paths by an agent.

## Out of scope

- Applying any change to `~/.claude` (human pastes).
- The graphify always-on architecture itself (separate design; this spec only references the `codebase-analyst` graphify heuristic).
- Installing/configuring graphify or confirming its CLI surface.
- The deep-research marketplace-enablement fix.
- Authoring the implementation plan (this spec feeds `writing-plans`).

## Success criteria

- An implementation plan can be written directly from this spec with no further design decisions.
- All 13 agents are fully specified (model, access, tools, description, lane boundary, scope fence), with `[spec-derived]` tool lists clearly marked.
- The four red-team corrections are explicit and cannot be silently reversed.
- The graphify apply-doc can fold this in by reference (the `codebase-analyst` heuristic + the routing matrix) without contradiction.
