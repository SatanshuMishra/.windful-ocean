# Parallel Execution Two-Lane Redesign (Sub-project 3)

- Date: 2026-06-11
- Status: Design approved in-session; spec under user review (pre writing-plans)
- Scope: Global (`~/.claude/`), project-agnostic
- Builds on: `2026-06-01-superpowers-parallel-boundary-overhaul.md` (the existing engine), sub-project 1 (`/verify-<project>` commands), sub-project 2 (context sentinel)

## Problem statement

Three defects in the current parallel machinery:

1. Parallelism is opt-in and inconsistently engaged. The user must know to invoke annotation + the engine; absent that, execution falls back to sequential or, worse, main-thread work.
2. Per-run cost is high (recorded: 1.26M-2.7M subagent tokens per batch) with no slimming levers applied, and the dispatch-architecture question (Workflow engine vs main-thread orchestration) had never been resolved with evidence.
3. Five production-run lessons (project memory `feedback_parallel_subagent_fallback.md`) exist only as project memory, not encoded in the skills or engine; the run-script generator lives in /tmp and is rebuilt by hand each run.

## Research basis (5 agents, round-2 adversarially verified)

- Workflow-script control flow consumes zero model tokens; main context holds only the invocation and return value — [Workflows docs](https://code.claude.com/docs/en/workflows): "A workflow script holds the loop, the branching, and the intermediate results itself, so Claude's context holds only the final answer."
- Main-thread orchestration with gate-faithful prompt inlining of a 15-task/6-wave graph would permanently consume ~110-190k main-context tokens (ceiling breach likely); a lean path-referencing protocol reduces that to ~20-30k for 57 agents — viable, but it loses deterministic dispatch, resume (`resumeFromRunId` cached results), and per-agent token observability.
- Classic subagents cannot spawn subagents — [Sub-agents docs](https://code.claude.com/docs/en/sub-agents) — so a delegated in-session orchestrator subagent is not an available architecture; the design space is main-thread dispatch, Workflows, or experimental agent teams (~7x cost — [Costs docs](https://code.claude.com/docs/en/costs)).
- Deterministic code paths are the recommended orchestration for predictable structure — [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents); deterministic dispatch is structurally injection-resistant at the control-flow layer — [CaMeL](https://arxiv.org/abs/2503.18813), [Design Patterns for Securing LLM Agents](https://arxiv.org/abs/2506.08837).
- Workflow-spawned subagents always run `acceptEdits` and inherit the session tool allowlist; launch consent is per-workflow-per-project recordable ("don't ask again") — [Workflows docs](https://code.claude.com/docs/en/workflows). No `Workflow(...)` permissions-rule syntax exists; promptless operation comes from recorded consent, not an allowlist entry.
- Parallel code-WRITING is the riskiest multi-agent shape; reads parallelize well, conflicting parallel writes are the failure mode — [Cognition](https://cognition.ai/blog/dont-build-multi-agents), [LangChain synthesis](https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems). Mitigated at annotation time (file partitioning, contract-pair serialization), not at dispatch time.
- Empirical token attribution (fit to the three recorded runs within +/-2%): ~50% implementer work, ~33-37% review agents, ~4-7% fix loops, ~9-16% integrator/boundary/final; ~46k tokens/agent floor dominated by per-agent harness context. The recorded failures cluster in the annotation and validation-command layers, not the execution engine.
- Slimming levers (estimated vs recorded runs): risk-scaled review ~14-18% tokens; non-code task exclusion ~10-20% (validated in Batch 5); no-worktree direct dispatch for disjoint sets ~10-13% (validated in Batch 6); model-tier routing ~55-60% dollars; template trimming <5% (not pursued). Stack: ~30-40% tokens, ~55-65% dollars.
- Round-3 routing derivation: manual dispatch's dominant cost is the post-wave full-price re-read term (~1.1 per wave times the accumulated main context, billed at the session tier), not dispatch growth — so wave duration vs the 5-minute cache TTL, not agent count, is the W=1 pivot; W>=2 manual is never cost-justified at realistic post-planning context (each wave ~1.5 agents of re-reads; mid-wave replanning observed 0/12 recorded waves). Official scale criteria are qualitative only ("a few delegated tasks per turn" vs "dozens to hundreds of agents per run" — [Workflows docs](https://code.claude.com/docs/en/workflows)); workflows do not require git, run in the background, resume in-session with cached completed agents, and accept no mid-run user input (same source). Dispatch mechanism and isolation model are independent axes; workflow + scope-fenced main tree (no worktrees/integrators) strictly dominates for wide disjoint single-wave fan-outs of long tasks. Misrouting is asymmetric (wrong-workflow ~free; wrong-manual pays re-reads + ~0.5*N*46k resume exposure), so uncertainty resolves toward the workflow.

## Decisions locked

| Decision | Choice |
|---|---|
| Architecture | Two-lane router: slimmed Workflow engine (heavy lane) + lean direct-Agent dispatch (light lane); lane chosen by a derived, parameterized rule (Component 1), not asserted thresholds |
| Isolation model | Independent second axis: worktrees+merge for multi-wave graphs; scope-fenced main tree (engine arg) for provably-disjoint single-wave fan-outs |
| W=1 routing pivot | Wave duration vs the 5-minute cache TTL (`D`), not task count; uncertain duration resolves to workflow (misrouting asymmetry) |
| Default behavior | Parallelism engages automatically when an approved plan is executed; no cost gate — one-line notice, immediate dispatch |
| Sequential fallback | Only when every wave has width 1; still subagent-driven, never main-thread |
| Main-thread role | Pure orchestrator, globally: new delegation-discipline rule; even analysis/debugging/research delegated |
| Run lessons | Folded into annotation rules and dispatch prompts (not a separate workstream) |
| Cost visibility | Notice (lane, waves, agent/token estimate) printed at dispatch; no approval wait |
| Review structure | Risk-scaled: merged single reviewer for `risk: low` tasks; two sequential lenses (spec, then quality) for `risk: high` |
| Model tiers | Reviewers + fix agents on cheaper tier; implementers inherit session model; boundary + final reviewer on strong tier |
| Generator | Promoted from /tmp to `lib/superpowers-parallel/generate-run-script.mjs` |

## Component 1: Routing rule (rewritten `parallel-subagent-development` skill)

Engages automatically on "implement/execute the plan" for an approved plan. Missing `.graph.json` -> auto-invoke `parallel-plan-annotation` first.

Two independent axes (round-3 research): the DISPATCH MECHANISM (workflow script vs main-thread Agent calls) and the ISOLATION MODEL (worktrees+merge vs scope-fenced main tree). The rule below routes the dispatch axis; the isolation axis is decided in Component 3.

Routing parameters, computed at dispatch time:

- `T`: graph task count (code tasks only, per Component 6 rule 3); `W`: wave count from `wave-planner.mjs`; `N ~= 2.6*T + 2`: expected agent invocations under risk-scaled review.
- `D`: wave duration class. `long` if any task in the wave involves TDD, multi-file edits, or a test-running scoped check (> 5-minute prompt-cache TTL); `short` only for single-file mechanical edits with trivial checks. Uncertain -> `long` (misrouting is asymmetric: a wrong workflow costs ~nothing; a wrong manual run pays full-price post-wave re-reads plus ~0.5*N*46k resume exposure on interruption).
- `S`: sentinel `used_pct` from `~/.claude/run/context-sentinel-<session_id>.json` (absent -> 0, fail-open); `GIT`: repository present; `WF`: Workflow tool resolves (`ToolSearch select:Workflow`; requires Claude Code >= 2.1.154 — detection method validated in the production runs).

Rules, first match wins:

1. `WF` unavailable -> manual light lane regardless of shape. If `W >= 2` or `T >= 5`, the notice states the cost of proceeding and recommends upgrading Claude Code + restarting first. Lean protocol and per-wave run ledger mandatory (Component 2).
2. `S >= 80` -> if `WF`: dispatch the workflow (main-context cost ~2k, ceiling-immune, continues in background), then immediately recommend session handoff. Else: handoff first, dispatch nothing.
3. `T = 1` -> one implementer subagent inline + risk-scaled review + boundary. No engine, no lane scaffolding.
4. `S >= 70` -> take the workflow at every choice point below (derived: at C0 = 140k, manual W=1 already costs ~5.8 agents of extra re-reads). Where manual is forced (rule 5), recommend handoff before dispatch.
5. No `GIT` -> manual light lane (worktrees and deterministic fence verification both need git), sequential waves, lean protocol + per-wave run ledger.
6. `W >= 2` -> heavy lane (Workflow engine, worktree isolation). Exception: the user explicitly declares the plan exploratory AND `W <= 3` AND `S < 50` -> light lane, with the premium (~1.5 agents of re-read cost per wave) stated in the dispatch notice.
7. `W = 1`, `D = short` -> light lane at any width up to `N <= (160k - C0)/425` (the 80%-line cap on lean dispatch growth; ~dozens in a fresh session). This is the validated Batch-6 shape.
8. `W = 1`, `D = long`, `T = 2` -> light lane by default (immediacy, at a stated ~1.6-agent premium); workflow instead when launch consent is already recorded and `S >= 50`.
9. `W = 1`, `D = long`, `T >= 3` -> workflow, scope-fence isolation preferred (Component 3); worktree isolation until scope-fence ships.

Tie-breakers when a rule leaves a choice: expected wall-clock > 30 minutes -> workflow (background continuation + TTL); session model is the top tier -> workflow (manual re-reads bill at the session tier); when uncertain, workflow (the asymmetry above).

Threshold provenance: every number traces to the round-3 crossover model (post-wave full-price re-read term `~1.1*W*C-bar` dominates manual cost; `D` vs the 5-minute TTL is the W=1 pivot, not `N`; gate-faithful prompt inlining breaches the window by N~=40 and is prohibited outright — lean path-referencing dispatch is the only permitted manual protocol). Sentinel thresholds are pure window arithmetic and robust; the `D` classifier and the rule-8 immediacy default are flagged judgment calls, revisable from observed run data.

Dispatch notice (both lanes, no gate): one line — lane + isolation, wave layout, agent count, token estimate, model tiers, and any priced exception taken.

## Component 2: Light lane protocol

Lean dispatch from the main thread via parallel `Agent` calls, one message per wave:

- Prompts carry plan-file path + task id + fileScope + the scoped check command. The subagent reads the plan itself; task bodies are never inlined into main context.
- Result contract: one-line structured status (DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT + <=50-word summary). Verbose output stays in the subagent.
- Main tree, no worktrees, no integrator agents, no commits by task agents.
- Scope fence in every prompt: touch nothing outside the declared fileScope; no git mutations; no full builds or suites; scoped check only.
- Gates preserved: per-task risk-scaled review (same prompts as the heavy lane, late-bound); ONE boundary validation at the end via `/verify-<project>` (fallback per Component 4); final whole-diff review when the run had >=2 code tasks.
- All fixes (review failures, boundary failures) dispatch fix agents; the main thread never edits code.
- BLOCKED / NEEDS_CONTEXT or a scope-fence violation halts dependents and surfaces loudly, mirroring engine semantics.
- Per-wave run ledger: after each wave the orchestrator appends one line per task (id, status, files touched) to a run-ledger file next to the graph (`<plan>.run-ledger.md`). An interrupted manual run loses at most the in-flight wave instead of everything (manual dispatch has no resume; this caps the ~0.5*N*46k re-run exposure).
- Result-size cap: the one-line contract keeps per-agent returns <= ~350 tokens; a task that genuinely needs a verbose return does not belong in the light lane (route via rule 7's width cap or the workflow).

## Component 3: Heavy lane (engine v2 — `workflows/parallel-plan-execution.js`)

Changes to the existing engine, gates otherwise byte-identical:

- Risk-scaled review: tasks carry `risk` from the graph. `low` -> one merged reviewer whose prompt enforces spec compliance as a hard precondition before quality judgment; `high` -> the existing two sequential lenses. Fix-loop semantics unchanged (`fixLoopMax` 3).
- Model-tier args: `models: { reviewer, fixer, implementer, boundary, finalReviewer }` — reviewers and fixers default to `sonnet`, implementer inherits the session model (omitted), boundary and finalReviewer inherit the session model and are never downgraded (the final reviewer has demonstrably caught runtime-semantics bugs).
- Implementer preamble gains the worktree bootstrap: `ln -sfn <repo>/node_modules node_modules` (idempotent) before any check.
- New isolation arg (`isolation: 'worktree' | 'scope-fence'`, the second axis from Component 1). `scope-fence` is selected only for single-wave graphs whose scopes are provably disjoint and a clean tree at launch: agents edit the main tree within their declared `fileScope`, no worktrees, no integrator agents (saves ~6.5k/task + ~30k/wave; ~121k on a Batch-6-shaped run). The script verifies the fence deterministically after the wave: `git status --porcelain` paths must be a subset of the declared fileScope union; any undeclared path halts loudly (this check replaces the merge conflict-check as the independence backstop, and is stronger than the light lane's prompt-only fence because the script, not the agent, verifies). Reviewers read `git diff <launch-commit> -- <fileScope>` per task. Multi-wave graphs always use `worktree` (branch-per-task recovery is what made the 2026-06-09 halt recoverable).
- Halt semantics, merge conflict-check (worktree mode), boundary + one bounded fix attempt: unchanged.

## Component 4: Validation-command resolution (both lanes)

Priority order: (1) project `/verify-<project>` — scoped invocation as `scopedCheckCmd`, full invocation as `fullValidationCmd`; (2) composed from package.json scripts; (3) ask the user. For repos that are not type-clean: the baseline-diff gate is the documented fallback — capture `tsc --noEmit` errors from a clean base worktree once, fail only on `comm -13 baseline now` novelty; two baselines when worktrees see different untracked state (per the 2026-06-10 run).

## Component 5: Generator promotion

`lib/superpowers-parallel/generate-run-script.mjs`: reads `<plan>.graph.json`, runs `resolve-superpowers.mjs --prompts` and `wave-planner.mjs`, validates the graph, and emits a self-contained run script — the vendored engine body verbatim with its `const X = args.X` header replaced by inlined JSON literals — to `<plan>.run.js` next to the graph (overwritten per run, never committed). The skill invokes `Workflow({scriptPath})` with no args. Kills the /tmp dependency, hand-transcription risk, and the named-args instant-failure mode. First heavy-lane run per project records "don't ask again" launch consent; subsequent runs are promptless.

## Component 6: Annotation hardening (`parallel-plan-annotation` v2)

New mandatory rules, folding in the recorded lessons:

1. Contract-pair serialization: any emit<->consume pair (client body <-> route reader, handler payload <-> client reader) gets a `dependsOn` edge — never the same wave.
2. Exact-match shared-fixture/registry drift tests are banned from `scopedCheckCmd`; they run once at the boundary. A shared file every task must edit to go green cannot be owned by a serial task.
3. Non-code tasks (docs, audits, manual gates) are excluded from the graph and dispatched as ordinary subagent post-steps after the run.
4. New per-task field `risk: low | high` (high: contract pairs, auth/authz, migrations, concurrency, public API shape); drives review scaling in both lanes.
5. Existing rules retained: exhaustive fileScope, overlap -> serialize, cycle/unknown-dep checks.

Graph schema addition: `risk` (required). `wave-planner.mjs` passes it through untouched.

## Component 7: Delegation discipline (new `rules/common/delegation-discipline.md`)

The main thread never implements, debugs, researches, or analyzes directly — it routes work to subagents, reads what routing and judgment require, reviews results, talks to the user, and writes the judgment artifacts of that role (specs, plans, ledger entries, dispatch prompts). Carve-outs: reading plan/ledger/config files needed to orchestrate; read-only routing commands (ls, jq, git status-class); purely conversational answers. Everything else — including a one-line typo fix — dispatches a subagent, at a known ~5-10k-token round-trip cost, accepted by design. This rule supersedes tool-routing.md's "stay native for small edits" for code mutations; tool-routing.md gets a pointer line.

## Component 8: Security guardrails

Required by no-gate + `acceptEdits` workflow subagents:

- `permissions.deny` entries shipped in `~/.claude/settings.json`: the no-direct-db-access command patterns (`supabase db push`, `supabase migration up`, etc.), secrets paths (`.env*`, key files), destructive git (`push --force` to protected, `reset --hard` on shared branches).
- Curated Bash allowlist so heavy-lane runs do not stall mid-flight on permission prompts.
- `disableWorkflows` documented as the kill switch; light-lane agents additionally scope-fenced by prompt.
- Both lanes remain bound by the global no-DB rule; no agent may connect to live databases regardless of lane.

## Failure modes

- Scope-fence violation, either lane (light: boundary diff shows undeclared paths; heavy scope-fence mode: post-wave `git status --porcelain` superset check fails): halt, surface files + task id.
- Light lane mid-run context pressure (sentinel >=80 between waves): finish the in-flight wave, then stop and recommend handoff; never dispatch a new wave past 80.
- Heavy lane: existing halt taxonomy unchanged (task failure / merge conflict / boundary failure), plus generator validation errors fail before any agent spawns.
- Routing ambiguity (graph malformed, wave-planner error): stop and report — annotation is wrong; never guess a lane.
- `/verify-<project>` absent: suggest verify-setup once, fall back per Component 4.

## Verification plan (for the implementation phase)

1. Routing-rule table test: a fixture matrix over the Component 1 parameters — 1-task; W=1 short fan-out width 6 (-> light); W=1 long T=3 (-> workflow scope-fence); W=1 long T=2 (-> light default); 3-wave/4-task (-> workflow, no exploratory flag); 6-wave/15-task; non-git; WF-unavailable; sentinel at 45/72/81 — asserting lane + isolation for each, first-match-wins order respected.
2. Generator unit test: emitted script == vendored engine body with only the args header replaced; malformed graph -> loud error, zero agents.
3. Light-lane fixture (throwaway /tmp git repo): 3-task disjoint plan end-to-end — scope fence honored, statuses collected, one boundary run, final review fired; a deliberate out-of-scope write halts.
4. Heavy-lane fixture: 2-task plan through the generator + engine v2 in a /tmp repo — risk-scaled review paths both exercised (one low, one high task), model-tier args visible in dispatch, node_modules symlink present in implementer prompt. Scope-fence mode fixture: single-wave 3-task disjoint graph runs without worktrees/integrator; a deliberate undeclared write trips the porcelain superset check and halts.
5. Annotation v2 subagent test: a sample plan containing a deliberate emit<->consume pair and a shared exact-match fixture -> graph serializes the pair, excludes the fixture test from scopedCheckCmd, marks risks correctly.
6. Delegation rule: grep-level consistency check against tool-routing.md (pointer present, no contradicting mandate left).
7. Real-project validation (Pathfinder batch) happens later as normal usage, not in this sub-project.

## Out of scope

- Agent teams (experimental, ~7x token cost) and any inter-agent messaging.
- Monorepo affected-graph tooling.
- Editing vendored Superpowers plugin files (precedence stays asserted from user rules).
- Sub-project 4 (code-quality auto-integration).
- Retiring `subagent-driven-development` upstream; it remains the inline degenerate-case executor.
