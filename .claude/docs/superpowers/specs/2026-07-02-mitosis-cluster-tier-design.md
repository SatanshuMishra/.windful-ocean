# Mitosis Cluster Tier — 2-Layer Parallelization (Design-Delta Spec)

Date: 2026-07-02
Thread: mitosis-cluster-tier
Status: draft for review (pre-/writing-plans)
Extends (does not supersede): `docs/superpowers/specs/2026-06-29-mitosis-design.md` — the shipped serial-MSP Mitosis.

This is a DELTA spec. It changes the shipped Mitosis workflow from a single serial MSP loop into a 2-layer fractal: SPEC -> CLUSTERS (parallel) -> MSPs (sequential-within-cluster, JIT-planned) -> TASKS (parallel/sequential). It is the input to `/writing-plans`. Nothing here is applied to `~/.claude` until a plan is written and approved.

Decision provenance (canonical; this spec operationalizes them, it does not re-litigate them):
- `decisions/2026-07-02-mitosis-2layer-design-ratified.md` — the 2-layer model + resolved feasibility unknowns + inline-engine recommendation.
- `decisions/2026-07-02-mitosis-cluster-tier-gap-confirmed.md` — CONFIRMED gap, 3 blockers, lift-the-fractal fix surface.
- `decisions/2026-07-02-mitosis-model-tiering-kept.md` — drop all-Opus; keep Opus-lead + Sonnet-workers; two unintended non-Opus gaps left open for THIS spec.
- Full evidence: `projects/-Users-satanshumishra--claude/reports/mitosis-cluster-tier/2026-07-02-diagnostic-2-layer-parallelization-robustness-audit.html`.

---

## 1. Goal

Make Mitosis accept and correctly parallelize a SPEC whose MSPs are not a single dependency chain. Independent groups of MSPs must develop concurrently; dependent groups must stay serial; every shared branch must stay green at all times.

The 2-layer model (ratified):
- **Layer 1 — CLUSTERS run in PARALLEL.** A cluster is a connected group of dependency-linked MSPs. An all-sequential SPEC yields one cluster; N fully-independent MSPs yield N parallel clusters.
- **MSPs within a cluster are SEQUENTIAL and JIT-planned** — plan the cluster's first MSP, execute and ship it, then plan the next against the already-merged state. (This per-chain JIT loop already exists at `workflows/mitosis.js:211`; the delta runs N chains at once.)
- **Layer 2 — TASKS within an MSP run parallel or sequential** per their task graph. This tier already works (the wave engine).

**Parallel-safety rule (Three Pillars, Quality > Speed).** Two MSPs may occupy different (parallel) clusters ONLY if they are dependency-independent AND fileScope-disjoint AND have no semantic-boundary interaction. Dependency-independence alone is necessary-but-NOT-sufficient. When any of the three is uncertain, the MSPs share a cluster (serialize). Over-serialization is the safe default; under-serialization is a correctness bug.

Non-goals (explicitly out of scope here):
- Re-litigating the shipped Mitosis flow (decompose/prepare/plan/harden/branch/execute/ship stages, receipts adoption, squash + branch contract, D1 code-intel stack). Those stand.
- The parked worker-tier model question (all-Opus was dropped; Opus-lead + Sonnet-workers stays). Only the two UNINTENDED non-Opus gaps in Section 7 are in scope.
- Building this feature is itself governed by Section 8 (`~/.claude` is non-git -> serial human-approved apply).

---

## 2. Governance — Three Pillars

Unchanged and load-bearing here. Quality > Optimization > Speed; never trade a higher pillar for a lower one (`rules/common/pillars.md`).

Two governance consequences drive every fix below:
- **Monotonic over-serialization.** Both the plan-time clusterer and the merge-time gate may only ADD serialization, never remove it. The system is never *less* serialized than ground truth demands. This mirrors the existing task-tier edge derivation (`lib/superpowers-parallel/derive-edges.mjs:44-100`), lifted one level.
- **The static-oracle residual is covered at merge time, not pretended away at plan time.** No static analysis is 100% (Rice's theorem; native-LSP recall < 100% on dynamic dispatch / DI / FFI / SQL / codegen). Plan-time clustering is safe-biased but fallible; the merge-time cross-cluster gate (Fix 3) is the backstop for what it misses.

---

## 3. Current Architecture (the baseline this delta changes)

Verified against code so `/writing-plans` starts from ground truth (ledger claims are hints; these are code-confirmed):

- **No cluster concept; unconditional serial loop.** `DECOMPOSE_SCHEMA` carries only `{ id, title, rationale, dependsOn }` — no `cluster`, no `fileScope` (`workflows/mitosis.js:19-40`). MSPs execute in a plain `for` loop over array order (`workflows/mitosis.js:206`). `dependsOn` is VALIDATED as a bottom-up ordering (`workflows/mitosis.js:173-185`) but never SCHEDULED on — array order IS execution order. Prompts conflate array position with dependency via `msps.slice(0, i)` (`workflows/mitosis.js:216`, `:356`).
- **The engine is not instance-safe on a shared repo.** `workflows/parallel-plan-execution.js` is the deterministic per-MSP task engine, invoked once per MSP via nested `workflow()` (`workflows/mitosis.js:336`). Its `branchOf(id)` is namespaced by `branchPrefix` (`:39`) but `worktreeOf(id)` is NOT — it keys on `worktreeRoot/task-<id>` (`:40`), so two concurrent instances sharing a `worktreeRoot` collide on the same worktree path. Its merge (`:208-214`, `git -C ${repoRoot} checkout ${baseBranch}` at `:210`), boundary validation (`:234-236`, `cd ${repoRoot}` at `:235`), and final review (`:250-256`) all run on the SHARED main-repo HEAD. Concurrent instances would race the shared index/HEAD. `scope-fence` isolation edits the main tree directly (`:62-64`) and requires a single wave (`:167-170`) — inherently non-concurrent.
- **The Branch and Ship stages also assume exclusive repoRoot HEAD.** Branch cuts the integration branch with `git -C ${repoRoot} checkout -B` on the main tree (`workflows/mitosis.js:320-329`); Ship pushes that branch (`:355`). Prepare (`:196`) commits/pushes the receipts install once, before fan-out (safe on repoRoot).
- **The cross-cluster overlap gate is missing.** fileScope/semantic overlap serialization exists only at the TASK tier (`lib/superpowers-parallel/wave-planner.mjs:25-28,:49-52`; `derive-edges.mjs:74-81`). D6 is pairwise-per-PR (`skills/mitosis/templates/receipts.yml:20-21`, `templates/d6-check.md`) — it computes new dependents of ONE PR's `base..head` and never sees another cluster's diff, so a cross-cluster interaction landing on the shared branch is caught by neither PR.
- **Model knobs are reviewer + fixer only.** The engine reads `models.reviewer` / `models.fixer` (`workflows/parallel-plan-execution.js:27-29`); implementer inherits (`:29`). Decompose has no model override (`workflows/mitosis.js:151-159`). See Section 7.

---

## 4. Fix 1 — Cluster Tier (blocker #1)

Lift the task-tier fractal up one level. The change surface:

- **Add MSP-level fileScope to the decomposer's intent.** Extend `DECOMPOSE_SCHEMA` (`workflows/mitosis.js:19-40`) so each MSP declares a coarse best-effort `fileScope` (globs/paths) alongside `dependsOn`. The decomposer already grounds dependency edges in native caller/callee facts (its prompt, `workflows/mitosis.js:155`); it now also declares the surface each MSP writes. This declared scope SEEDS plan-time clustering; the AUTHORITATIVE scope is aggregated post-Harden (Fix 3).
- **Derive clusters, do not let the decomposer declare them.** A cluster = a connected component of the MSP graph whose edges are `declared dependsOn` UNION `fileScope-overlap` UNION `discovered semantic edges`. Reuse the exact machinery from the task tier, lifted to MSPs: `scopesOverlap` (`lib/superpowers-parallel/wave-planner.mjs:25-28`) for overlap edges; the monotonic add-only, cycle-detecting `deriveEdges` shape (`lib/superpowers-parallel/derive-edges.mjs:44-100`) for the union graph; connected components over the undirected edge set for cluster membership. Clustering may only ADD edges (merge two would-be-parallel MSPs into one serial cluster), never split a declared dependency.
- **Order within a cluster stays bottom-up.** Inside each cluster, MSPs keep the existing topological order and JIT plan/execute/ship loop (`workflows/mitosis.js:211-378`). The `msps.slice(0, i)` "earlier MSPs" references (`:216`, `:356`) must be re-scoped to "earlier MSPs *in this cluster's chain*," not array position across the whole run.
- **Replace the serial `for` loop with a parallel cluster scheduler.** The single loop at `workflows/mitosis.js:206` becomes: derive clusters, then run clusters concurrently (see Fix 4 for the execution primitive), each cluster running its MSP chain serially.

Contract: a SPEC that is one dependency chain yields exactly one cluster and behaves identically to today (no regression). A SPEC of N independent MSPs yields N clusters that develop concurrently.

---

## 5. Fix 2 — Instance-Safe Engine (blocker #2)

The engine's instance-safety is currently EMERGENT from the serial loop, not enforced. Under parallel clusters it must be enforced structurally. Change surface:

- **Namespace the worktree path by `branchPrefix`.** `worktreeOf(id)` (`workflows/parallel-plan-execution.js:40`) must incorporate `branchPrefix` (already unique per MSP: `${sourcePrefix}/${msp.id}`, `workflows/mitosis.js:208`), matching how `branchOf` (`:39`) already isolates branches. No two concurrent instances may resolve the same worktree path.
- **Move all HEAD-mutating git off the shared repoRoot into per-instance integration worktrees.** The engine's merge (`:208-214`), boundary validation (`:234-236`), and final review (`:250-256`) must run in a dedicated per-instance integration worktree checked out to that MSP's integration branch — via `git -C <integration-worktree>` — never `git -C ${repoRoot} checkout`. The main repoRoot HEAD is never checked out by a concurrently-running engine.
- **Move the Branch stage off shared HEAD too.** `workflows/mitosis.js:320-329` cuts the integration branch with `git checkout -B` on repoRoot; under parallel clusters this must create the branch in the per-instance integration worktree (fetch + branch without moving repoRoot's HEAD). Ship's push (`:355`) then pushes from that worktree.
- **`scope-fence` stays single-cluster-only.** It edits the shared main tree (`:62-64`) and requires a single wave (`:167-170`); it is valid only for the inline/solo lane, never for parallel clusters. Mitosis already forces `isolation: 'worktree'` per MSP and validates it (`workflows/mitosis.js:238,:246`) — keep that invariant and document that parallel clusters REQUIRE worktree isolation.

Contract: two engine instances launched concurrently with the same `worktreeRoot` and `repoRoot` but different `branchPrefix` never touch the same path and never contend for repoRoot's HEAD.

---

## 6. Fix 3 — Cross-Cluster Overlap Gate + Serialized Merge Queue (blocker #3)

The serial loop is today's implicit merge queue (one MSP fully ships before the next begins). Parallelizing clusters removes that implicit serialization, so it must be re-added EXPLICITLY at the merge boundary while development runs concurrently. "Parallelize development, serialize the merge."

- **MSP-level fileScope is aggregated post-Harden.** Each MSP's authoritative write-set is the union of its task-graph `fileScope`s, which exist after the Harden stage builds the id-keyed task map (`workflows/mitosis.js:237`). This ground-truth scope (not the decomposer's coarse declaration from Fix 1) feeds the merge-time gate.
- **Serialize merges into the shared base branch.** All MSP PRs across all clusters ultimately merge into the one shared `baseBranch`. Those merges must pass through a serialized queue (one merge into `baseBranch` at a time), even though the clusters that produced them developed in parallel.
- **Gate each merge on the combined state.** Every merge into `baseBranch` is gated by the existing receipts stack applied at this boundary: the red->green receipt, G8 fresh-base (forces the PR onto the latest `baseBranch` so a just-landed sibling cluster's changes are included), G9 full-suite, and D6 (`skills/mitosis/templates/d6-check.md`) now evaluated over the combined post-merge state rather than a single isolated PR. G8's fresh-base rebase + full re-run IS the combined-state check that catches a cross-cluster interaction the plan-time clusterer missed.
- **The gate is monotonic.** When the ground-truth aggregated fileScopes of two clusters actually overlap at merge time (despite being planned disjoint), the queue may only ADD serialization / force re-validation on the fresh base — never skip a check or merge in parallel.

Contract: if cluster A and cluster B were wrongly planned as parallel (a semantic edge escaped plan-time detection), the serialized queue + G8 fresh-base + D6-over-combined-state surfaces the regression before B lands, and B is re-validated against A's merged state. No un-revalidated combined state ever reaches `baseBranch`.

Open sub-question for `/writing-plans` (flagged, not decided here): whether the serialized merge queue lives in the Mitosis orchestrator (JS scheduler serializes the Ship stage across clusters) or is delegated to a platform merge queue (e.g. GitHub merge queue) where available. Recommendation: orchestrator-owned serialization by default (works in every git host and in the degraded `~/.claude` case), with platform merge-queue as an optional optimization. Confirm during planning.

---

## 7. Fix 4 — Inlined-Engine Execution Pattern (recommended)

The feasibility unknown is resolved: N concurrent top-level `workflow(engine)` calls ARE allowed (nesting depth != fan-out width; the harness Workflow spec permits one-level nesting with a shared 16-concurrent / 1000-agent / token budget). But a nested cluster-workflow that itself calls `workflow(engine)` is depth-2 and THROWS. Three patterns follow; the ratified choice is #1.

- **Pattern #1 — INLINE the engine (RECOMMENDED, ratified).** Extract the engine body (`workflows/parallel-plan-execution.js`) into a shared async function, e.g. `runEngine(engineArgs, ctx)` where `ctx = { agent, parallel, pipeline, log, phase }` is injected rather than read from workflow globals. Mitosis then runs Layer-1 clusters as `parallel()` / `pipeline()` thunks and calls `await runEngine(...)` INLINE inside each cluster thunk — so every `agent()` executes at the single top-level run (depth 0). Uses only SDK-listed primitives; no `workflow()` nesting; no depth-2 throw risk; one budget/concurrency accounting level. The standalone `parallel-plan-execution.js` workflow becomes a thin wrapper that calls `runEngine` with the ambient globals, so its existing entry point and callers keep working.
- **Pattern #2 — nested `workflow(engine)` per cluster (REJECTED, second-best).** Even the allowed form (`parallel(msps.map(() => workflow(engine)))` fanned from the top level) is rejected: it relies on `workflow()` in a `parallel()` thunk (no in-repo precedent), spends against the shared budget opaquely, and a cluster-workflow wrapper calling `workflow(engine)` is depth-2 (throws).
- **Concurrent `phase()` safety.** `phase()` mutates global progress state; concurrent clusters must NOT race it. The engine already sets explicit `phase:` on every `agent()` opts (`workflows/parallel-plan-execution.js:128,:190,:236` etc.), which is the correct pattern — extend it so the inlined engine namespaces its phase label per cluster/MSP (e.g. `phase: \`${branchPrefix}:Waves\``) so the progress tree stays legible under parallelism. Never rely on the mutating global `phase(title)` inside a parallel thunk.

Contract: `runEngine` produces byte-identical behavior to today's `parallel-plan-execution.js` when called with one MSP's args, and is safe to invoke N times concurrently once Fix 2 (instance-safety) lands.

---

## 8. Model Tiering — the two UNINTENDED non-Opus gaps

Ratified (`decisions/2026-07-02-mitosis-model-tiering-kept.md`): DROP the all-Opus mandate; KEEP Opus-lead + Sonnet-workers (Anthropic's best-measured multi-agent config). The broad worker-tier question is PARKED. Two gaps were flagged as UNINTENDED — not deliberate tiering choices — and are in scope for this spec to weigh:

- **Decompose has no model knob.** Decompose is the highest-leverage judgment in the flow, yet runs with no override (`workflows/mitosis.js:151-159`) and the `models` contract exposes only `reviewer` / `fixer` (`workflows/parallel-plan-execution.js:27-29`). Recommendation: add a `models.decomposer` knob defaulting to `opus`, so the lead judgment runs Opus-led without forcing all-Opus elsewhere.
- **test-engineer's Opus-escalation is documented but unimplemented.** The agent frontmatter pins `model: sonnet` (`agents/test-engineer.md:5`), but its own doc promises highest-tier (Opus) reasoning for public-contract / authorization / core-invariant tests (`agents/test-engineer.md:14`). Because the engine dispatches task agentTypes with no model override (implementer inherits, `workflows/parallel-plan-execution.js:29`), the promise can't fire. Recommendation: reconcile — either remove the sonnet pin and let the caller escalate, or wire a critical-test Opus path (e.g. a per-task `criticalContract` flag that lifts the model). Pick one during `/writing-plans`.

Both are small, targeted edits; neither reopens the parked worker-tier decision.

---

## 9. Build Inventory (what `/writing-plans` will phase)

REWRITE:
- `workflows/mitosis.js` — extend `DECOMPOSE_SCHEMA` with MSP `fileScope`; add cluster derivation (components of deps ∪ overlap ∪ semantic); replace the serial `for` loop with a parallel cluster scheduler running per-cluster serial MSP chains via inlined `runEngine`; re-scope the `msps.slice(0,i)` "earlier MSPs" references to the cluster chain; move the Branch stage off shared repoRoot HEAD into per-instance integration worktrees; serialize the Ship-into-`baseBranch` merges through an explicit queue.
- `workflows/parallel-plan-execution.js` — extract the body into a shared `runEngine(engineArgs, ctx)` module; make this file a thin wrapper over it; namespace `worktreeOf` by `branchPrefix`; move merge/boundary/final-review into per-instance integration worktrees; per-cluster phase labels.

NEW:
- A shared engine module (e.g. `lib/superpowers-parallel/run-engine.mjs` or `workflows/lib/`) exporting `runEngine`.
- MSP-tier cluster derivation helper (reusing `scopesOverlap` + the `deriveEdges` shape + connected-components), e.g. `lib/superpowers-parallel/derive-clusters.mjs`.
- Merge-queue + combined-state gate wiring (orchestrator-owned serialization; the D6 combined-state invocation).
- If adopted (Section 8): a `models.decomposer` knob + the test-engineer critical-test escalation path.

REUSE (unchanged):
- `lib/superpowers-parallel/wave-planner.mjs`, `derive-edges.mjs` — the task-tier patterns being lifted; do not fork them, import their primitives.
- `skills/mitosis/templates/receipts.yml`, `templates/d6-check.md` — the D6 step is reused at the combined-state boundary; the pairwise-per-PR run stays.

DEPENDENCY ORDER (for planning): (a) extract `runEngine` + instance-safety (Fix 2, Fix 4) — the prerequisite the serial loop hides; then (b) cluster derivation + parallel scheduler (Fix 1); then (c) cross-cluster gate + serialized merge queue (Fix 3); then (d) the two model-knob edits (Section 8, independent, can land any time). Fix 2/4 must precede Fix 1 — parallelizing clusters over a non-instance-safe engine is a correctness regression.

---

## 10. Environment Constraint — `~/.claude` is non-git

The cluster fan-out, per-instance integration worktrees, serialized merge queue, and receipts CI enforcer govern the OTHER git repos Mitosis runs in. Building THIS feature into `~/.claude` itself (non-git) is a serial, human-approved apply: no worktrees / merge queue / enforcer here — they degrade to serial apply, per-task verification commands are the gate, and the `protect-claude-config` PreToolUse hook returns "ask" on skill/rule/workflow writes (expected). The 2-layer parallelism is a capability the built artifacts provide to git projects, not a mode this build runs in.

---

## 11. Open Risks / Watch Items

- **`runEngine` extraction is the load-bearing refactor.** If the engine body is not cleanly parameterizable over injected `{ agent, parallel, pipeline, log, phase }`, the inline pattern (Fix 4) degrades toward the rejected nested-`workflow()` pattern. Verify the extraction against the installed harness version before committing to Pattern #1; `parallel(() => workflow())` has no in-repo precedent (that's WHY inline is preferred).
- **Plan-time clustering under-detects by design at the margin.** The decomposer's coarse declared fileScope (Fix 1) plus fallible semantic discovery can place two genuinely-interacting MSPs in separate clusters. This is ACCEPTED and covered by the merge-time gate (Fix 3); the risk is a gate that is too weak. The gate's strength rests on G8 fresh-base + full-suite + D6-over-combined-state actually running — confirm receipts G8/G9 fire at the shared-branch boundary, not only per isolated PR.
- **Serialized-merge-queue ownership** (orchestrator vs platform merge queue) is unresolved — Section 6. Default to orchestrator-owned; confirm in planning.
- **Per-instance integration worktrees multiply disk + git overhead.** N parallel clusters each hold task worktrees + one integration worktree. Bound N (the harness caps at 16 concurrent agents regardless) and ensure spent worktrees are removed as today (`workflows/parallel-plan-execution.js:213`).
- **CC worktree base-ref edge bugs** (#70466 / #67196 / #69802) remain open (per the original spec §10) — watch for base-ref regressions now that far more worktrees are live concurrently.
- **WIP hygiene:** `vibesec-integration` and `continuity-redesign-v2` threads are also paused (unrelated). Dispose or sequence before broad new work if a clean board is wanted.
