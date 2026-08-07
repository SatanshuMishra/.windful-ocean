# Mitosis Throughput + Per-Task Model Policy — SPEC

Status: DRAFT (awaiting user approval before implementation)
Date: 2026-07-15
Thread: mitosis-robustness-overhaul
Branch (implementation target): feat/mitosis-robustness (HEAD 720ab0f at authoring)
Authoritative inputs (folded, not re-litigated):
- decisions/2026-07-15-mitosis-throughput-parallelism.md (Issues 9-14)
- decisions/2026-07-15-mitosis-model-selection-policy.md (per-task engine-enforced model policy; supersedes the global-knob part of R8)
- decisions/2026-07-15-mitosis-implementer-sonnet-tiering.md (R8-1..R8-4 sequence + 3 governance fixes)
- analysis/2026-07-15-mitosis-throughput-audit.md (file:line evidence, Pillar-1 floor, refuted hypotheses)
- analysis/2026-07-15-mitosis-model-selection-architecture.md (policy layers, enforcement moves E1-E6)

This SPEC is the sole self-contained input for a Dynamic Workflow to implement. It folds TWO
decision sets that share ONE enforcement seam (the per-task schema field + guarded dispatcher +
fail-closed invariant), so they are specced together, not in isolation.

---

## 1. Scope

IN scope (this SPEC):
- Throughput Issues 9-14 (Issue 9 = in-run merge poll; stacked-PR pipelining DEFERRED).
- The R8 model-tiering upgraded to the per-task engine-enforced model policy (R8-1, R8-2-upgraded,
  R8-3, R8-4) + the 3 governance bug-fixes (redispatch model-drop, reviewer-knob coupling, missing
  diagnostician).

OUT of scope (tracked elsewhere, do NOT build here):
- Issues 1-6 (ambient-gh repo scoping sweep, feature-base done-oracle sweep, durable-manifest rewrite,
  independent SPOFs, 17-twin dynamic-import collapse). EXCEPTION: the minimal repo-scoped, fail-closed
  done-oracle read that Issue 9's poll structurally requires (see §4) — that slice is IN scope because
  the directed fix is unsafe without it.
- Stacked-PR pipelining (Issue 9 deferred full-depth lever).
- The interim mirror-guard-in-CI quick win (de-prioritized by user).
- Any change to the Pillar-1 floor in §3.

Non-goals / explicitly rejected (from the decisions, restated so implementers do not re-introduce them):
- No engine auto-merge, ever. The poll READS; a human merges.
- No static global model threshold; no stochastic LLM model router.
- No removal/weakening of the lease or same-file-overlap checks.
- No prompt-sentence "policies." Every rule lands as engine-computed scheduling + schema-required
  fields + fail-closed invariants (§2).

---

## 2. Enforcement doctrine (the acceptance lens for every task)

Evidence (arXiv 2605.18414, quote-verified in the analysis): prompt-only process enforcement closes
only 11-18pp of violations; a deterministic architectural gate reaches ~0%. Therefore EVERY behavior
in this SPEC must be realized as ONE of:

1. Engine-computed control flow (a deterministic function the model cannot talk around), OR
2. A schema-required field with a whitelisted enum (strict), validated at the tool-call boundary, OR
3. A post-return fail-closed invariant (park / NeedsHuman) that fires on any cross-field violation.

A reviewer agent or a human is invoked ONLY for semantic quality judgments — never to enforce a rule a
deterministic check could enforce. A task whose only enforcement is "the prompt tells the agent to..."
FAILS review. Mitosis already uses this pattern (PARALLELIZE_SCHEMA mitosis.js:1039; the engineArgs
invariant block mitosis.js:2862-2901); the gap this SPEC closes is COVERAGE, not approach.

Corollary (do not over-schematize): prose fields (task.fullText, review issues) stay prose. Only
known-set / decision-bearing values become schema/enum/invariant. (Constraint Tax arXiv 2606.25605.)

---

## 3. Pillar-1 floor — MUST NOT be touched by any task here

Any diff that weakens one of these is rejected regardless of throughput gain:
- One-at-a-time merge into the shared base + fresh-base rebase + combined CI (receipts G8 / D6).
  Fixes PIPELINE builds; they never MERGE. Merge stays 100% human-permissioned.
- Same-wave / same-lease file-overlap forbidden (wave-planner.mjs:50-52; overlapHolder mitosis.js:1490-1503).
- Layer-2 monotone edge-adding (derive-edges.mjs) — dependencies may be added, never removed.
- Observe-then-converge idempotent resume (ship done-oracle mitosis.js:3014; worktree/branch/push guards).
- Scoped approval blocking — an awaiting PR blocks only its TRANSITIVE dependents (mitosis.js:3057-3058),
  never independent units.
- Reviews are pinned at or above the generator's capability (verifier >= generator).

---

## 4. Dependencies & assumptions (read before Part B)

Issue 9's in-run merge poll re-reads a "done-oracle" (is prereq PR merged on the correct base?) to
unblock dependents mid-run. That read is only Pillar-1-safe if BOTH hold:

- REPO-SCOPED. The read must target the run's actual repo (`gh ... -R <owner/repo>` or `GH_REPO`), NOT
  the ambient cwd. An ambient read is the exact defect that produced the continuity-v2 rebuild disaster
  (analysis/2026-07-14-mitosis-reconcile-ambient-gh-defect-catalog.md). A false-POSITIVE (merge seen in
  the wrong repo) would dispatch a dependent against a base that lacks the prereq — a bad-merge hazard.
- FAIL-CLOSED. Only a positively-confirmed `state == MERGED && mergedAt != null` on the correct base
  counts as merged. Any ambiguity (readError, null, non-MERGED, unreachable) → treated as NOT merged →
  the unit stays awaiting. A false-NEGATIVE is safe: it degrades to today's behavior (park + relaunch).

This SPEC therefore folds in EXACTLY that read (a repo-scoped, fail-closed, structured merge-watch),
and no more of Issues 1-2. The engine already derives the repo owner/name at reconcile time; the poll
reuses that derivation (do NOT re-derive from cwd). If the repo identity is unavailable, the poll is
disabled and the run degrades to today's park-and-relaunch (fail-safe), never guesses.

Environment constraints the implementer MUST respect:
- mitosis.js is a Workflow script: no `fs`, no `setTimeout`, and `Date.now()/Math.random()/new Date()`
  THROW. Any "wait", "timestamp", or "poll interval" must live inside a dispatched agent's shell
  (backgrounded `until` loop with `timeout`), never in the script body. Deterministic counts (max poll
  cycles) are legal in the script; wall-clock is not.
- Every engine-logic change touches TWO byte-identical copies: the inline twin in mitosis.js (region
  ~:650-941, called at :2927) and the module lib/superpowers-parallel/run-engine.mjs. mirror-guard.test.mjs
  must stay green after every task. (The dynamic-import collapse that would end twinning is a separate,
  out-of-scope decision.)
- Runtime executes the ~/.claude/... copies (byte-identical to repo today). Enforcement must be in the
  repo copies; the sync to ~/.claude is the user's existing step, not part of this SPEC.

---

## 5. Design

Ordering rationale: Part A (model policy) lands the schema field + `policyModelFor` + invariant +
guarded dispatcher FIRST, because it establishes the enforcement seam that Parts B-E reuse, and because
it can land fully with the implementer default STILL Opus (the Sonnet flip is the last, separately-gated
step). Then Part B (Issue 9, the dominant throughput win), then C (Issue 10), then D (11+12), then
E (13+14). This is the decision's recommended sequencing with Part A pulled first for seam-sharing.

### Part A — Per-task engine-enforced model policy (R8 upgraded)

Deterministic policy (from the architecture doc; restated as code contract):

```
policyModelFor(task) -> 'opus' | 'sonnet'      // pure, deterministic, no model call
  Layer 1 (categorical gate; non-overridable) -> 'opus' if ANY:
    - sensitiveScope(task.fileScope)      // glob table: auth, security, secret, payment, crypto,
                                          //   migrations/**, *.sql, infra/**, deploy/**, .github/workflows/**
    - irreversible(task.fileScope)        // migrations/**, *.sql, destructive-op keyword lint over fullText
    - breakingContract(task)              // task participates in a contract/api/schema edge (derive-edges reason)
    - blastRadius(task) >= K              // transitive DEPENDENT count (reverse of dependsOn)
    - task.risk === 'high'                // ratchet-UP only; never gates downward
  Layer 2 (fail-safe default) -> 'opus' if ANY:
    - planIncomplete(task.fullText)       // placeholder-lint fails (R8-1)
    - any signal missing/ambiguous/unparseable, unknown agentType
  Layer 3 (discretionary; the ONLY Sonnet emitter) -> 'sonnet' iff ALL:
    - role is an implementation role (not a review lens, not plan/plan-review/decompose/ship)
    - planIncomplete(...) == false
    - no Layer-1 categorical hit
  Reviews (any lens: plan-review / spec / quality / merged / security) -> ALWAYS 'opus'.
```

K (blast-radius threshold) and any future criticality percentile are the ONLY numbers. v1 ships a
conservative constant (recommend K = 3) documented as "calibrate against repo revert history later"
(Meta DRS: signal set portable, weights not). Bias is asymmetric: a false escalation wastes Opus tokens
(cheap); a false downgrade ships bad code (expensive) → when uncertain, Opus.

Enforcement moves (each maps to §2 category 1/2/3):

- E1 (schema field). Add `model` as a per-task field on the graph/engine task shape and to the tasks
  map built at mitosis.js:2851. Whitelisted enum {opus, sonnet}. The field is ENGINE-AUTHORED: the
  deterministic derivation writes `task.model = policyModelFor(task)`; the parallelize LLM never
  authors it. Category: (2).
- E2 (invariant, extend the block after mitosis.js:2901 — outside the twin region). For every task:
  assert `task.model ∈ {opus,sonnet}` AND `task.model === policyModelFor(task)` (recompute; catches
  tamper/drift/stale-resume). Assert `parallelized.engineArgs.models` deep-equals the operator `models`
  input (closes the LLM round-trip echo hole — today the map is echoed through the agent at :2852 and
  never re-validated). Any violation → parkUnit (fail-closed), mirroring the existing invariant style.
  Category: (3).
- E3 (guarded dispatcher). Route every engine `agent()` dispatch through a single wrapper that resolves
  the model from `policyModelFor(task)` (implementers) or the pinned 'opus' (reviews), IGNORING any
  echoed/knob model. The wrapper asserts that the model actually dispatched equals the policy model; if
  code drift ever passes a different one, it PARKS rather than dispatches. This replaces the ad-hoc
  `withModel(opts, implementerModel|reviewerModel|...)` calls in run-engine.mjs (:697/:781/:786/:796/
  :798/:814, and the mitosis.js twin). Category: (1)+(3). Note `withModel` (:652) `model ? {...} : opts`
  means "null = inherit = session Opus" today — the guarded dispatcher removes that implicit inherit.
- E4 (reviews pinned Opus). Every review-lens dispatch passes explicit 'opus' (plan-review at the MSP
  stage; spec/quality/merged/security in run-engine.mjs reviewLoop). The guarded dispatcher refuses any
  review-class dispatch that is not Opus (fail-closed). Removes the reliance on agent-file front-matter
  outside the engine. Category: (1).
- E5 (knob hardening). Whitelist `input.models.*` values to {opus, sonnet} at parse (engine-args.mjs /
  mitosis.js:2151); reject/park unknown or downgrade values so haiku/fable are unrepresentable. Neuter
  `models.reviewer` as a downgrade lever: it may only UPGRADE (or is deleted); it can never pull a
  review below Opus. Kills the "one knob downgrades security+quality+spec together" footgun
  (:781/:695/:137). Category: (2)+(3).
- E6 (retry-path coverage + R8-3 escalation). The remediation `redispatch` (mitosis.js:2070-2079)
  currently drops the model override; make it carry `policyModelFor(task)`. R8-3: when a discretionary
  (Sonnet) task reaches BLOCKED or review-exhausted, the escalation ladder redispatches on OPUS
  (gate-triggered — the failing review/boundary gate is the trigger, NEVER the Sonnet agent grading
  itself). Add model assertions to tests/run-engine.test.mjs (currently zero model coverage). Category:
  (1)+(3).

R8-1 (placeholder-lint) is a prerequisite INPUT, built as its own task: a pure, tested
`planIncomplete(fullText) -> bool` detecting placeholders / "TODO" / "...", stub RED steps, empty code
blocks, "implement here". It feeds Layer 2. It is the deterministic variant of the plan-review
completeness axis (chosen over the LLM axis because it must be per-task + testable).

R8-4 (the flip) is the LAST task and is SEPARATELY gated: only after E1-E6 + R8-1 + R8-3 are green does
Layer 3 begin emitting 'sonnet' for discretionary implementer tasks. Until then Layer 3 may emit 'opus'
(no behavior change), so the whole enforcement machine lands and is proven with zero risk, then the
default flips in one reviewed, revertible step. Opus stays pinned on decompose / plan / plan-review /
reviews / ship regardless.

Governance side-fixes (do regardless, per the R8 decision):
- diagnostician agentType (mitosis.js:2062) resolves to no agent definition. Either add a
  `diagnostician` agent def or re-point to an existing analysis agent; until resolved, the guarded
  dispatcher treats an unknown agentType as a Layer-2 fail-safe → Opus (already covered by E3).

### Part B — Issue 9: in-run merge poll (DOMINANT; ~80% of the win)

Root cause (confirmed at code): `isDispatchable` requires every prereq `state === 'done'`
(mitosis.js:1501); `AwaitingApproval` folds to `'parked'` via `dispositionOf` (:1512-1513); the tick
loop `break`s when nothing is dispatchable (:1549). Under the default human-gated policy the ship stage
stops at "PR open, awaiting approval" (:3005/:3028-3031) and NOTHING ever reaches `'done'` in-run →
per-run throughput = |root antichain| → 2-of-16.

Fix (engine-computed control flow; the poll never merges):

1. New non-terminal unit state `'awaiting'` distinct from `'parked'`. `dispositionOf` maps an
   `AwaitingApproval` outcome to `'awaiting'` (not `'parked'`). `isDispatchable` still treats an
   awaiting prereq as not-yet-done (dependents wait), but the scheduler no longer treats the run as
   finished while awaiting-progress is POSSIBLE.
2. Scheduler continuation (runSchedule mitosis.js:1543-1559). When `planTick` yields zero dispatchable
   units, do NOT immediately break. Compute `progressPossible = there exists an awaiting unit whose
   merge would make >=1 currently-blocked unit dispatchable`. If `progressPossible`, run a POLL cycle
   (step 3) instead of breaking; else break exactly as today.
3. Merge-watch (the only new dispatch). For each `awaiting` unit, dispatch a lightweight, REPO-SCOPED,
   FAIL-CLOSED merge-watch agent (§4): a backgrounded `gh pr view -R <owner/repo> <pr> --json
   state,mergedAt` bounded by `timeout` (the wait lives in the agent's shell, never the script). It
   returns structured `{ merged: bool, mergedAt: string|null, readError: string|null }`, validated by
   the engine against a strict schema. `merged === true && mergedAt` (positive confirmation on the
   correct base) → transition that unit to `'done'`, RELEASE its lease, record the merge in the ship
   log. Anything else → the unit stays `'awaiting'`.
4. Bound + fail-safe. A deterministic max-poll-cycle budget (script-side integer count; the per-cycle
   wall-clock spacing comes from the agent `timeout`, not the script). If the budget is exhausted with
   units still awaiting, park the awaiting units + their transitive dependents EXACTLY as today
   (blocked-pending-approval, mitosis.js:3085-3088) and end — no regression, strictly a superset of
   current behavior.
5. NEVER merge. The merge-watch is read-only; the human merges in the GitHub UI. Assert in code +
   test that the poll path issues no `gh pr merge` / `git push` to the base.

Interaction: within the current tick model this extends the loop's termination condition; it does NOT
require streaming dispatch (Part D). Parts B and D compose (streaming makes the poll interleave with
other running work) but B is correct and shippable on the tick scheduler alone.

### Part C — Issue 10: narrow fileScope GRANULARITY (not the lock)

The decompose prompt biases coarse ("Coarse and slightly over-broad is correct... err toward naming a
path when unsure", mitosis.js:2413), which — combined with prefix-overlap in wave-planner.mjs:13-28 and
the lease's `scopesOverlap` refusal to co-dispatch overlapping units — collapses independent-sibling
width toward 1.0. This DIRECTLY contradicts the task-level precision the skill already demands
(plan-to-task-graph/SKILL.md:17).

Fix: narrow scope GRANULARITY, keep the lock. The lock (same-scope units never co-dispatch) is
Pillar-1 and stays. Reduce false overlaps by making declared scopes precise:
- Reverse the decompose doctrine at mitosis.js:2413 from "coarse/over-broad" to "narrowest correct
  path set" (exact files, not parent dirs, when the change is file-local).
- This is a prompt change AND a check: add a deterministic post-derivation lint that FLAGS suspiciously
  coarse scopes (a bare top-level dir, or a scope covering >N files while the task text names specific
  files) so coarse scope is visible, not silent. The lint does not auto-narrow (that needs judgment);
  it surfaces for the reviewer. Enforcement category (2)/(3) for the flag; the narrowing itself is
  agent work under review.
- Pillar-1: same-file concurrent writes stay forbidden (wave-planner.mjs:50-52). Narrowing scope can
  only REMOVE false edges; it can never permit a real write collision (the lease still checks actuals).

Note: precise fileScope also sharpens `blastRadius` (Part A signal) — coarse scope inflates overlap
edges and thus dependents, so C improves A's model decisions as a side effect.

### Part D — Issues 11 + 12: de-serialize ship + remove BSP barriers

Issue 11 (serial merge queue + per-ship full-CI wait): every ship chains through one promise
`mergeQueue = mergeQueue.then(shipOneMsp)` (mitosis.js:3050) and each ship blocks on `gh run watch
--exit-status` full CI with no timeout (:3019). N MSPs → ~N sequential CI waits.
Fix:
- Pipeline the pre-merge work: rebase / push / open-PR / start-CI for the next ready MSP while the
  current MSP's CI runs. Only the human-permissioned merge step serializes (and under human-gated it is
  not the engine's step at all).
- The CI wait moves into a backgrounded, `timeout`-bounded watch (perf rule: long polls background),
  returning the terminal conclusion — no foreground re-invoke streaming CI logs into context.
- Pillar-1: nothing merges until it passed CI in the EXACT combination it lands in — the fresh-base
  rebase + combined CI (G8/D6) at ship stays. Speculative/merge-train batching is noted as a FUTURE
  lever; v1 only pipelines the pre-merge work + backgrounds the watch.

Issue 12 (two stacked BSP barriers): the tick barrier `joinTick` awaits `Promise.allSettled` over the
whole tick before the next plan (mitosis.js:1538-1556); the wave barrier `for(wave) await parallel(...)`
fully resolves+merges+gates each wave before the next (run-engine.mjs:191-240). Stragglers idle ready
work.
Fix: streaming/dataflow dispatch — launch a unit the instant ITS OWN prereqs + lease are clear, rather
than at a tick/wave boundary.
- CARE POINT (from the audit): per-tick lease reset relies on the barrier. Streaming REQUIRES leases to
  be held for the DURATION a unit is RUNNING (acquire on dispatch, release on settle), not reset per
  tick. This is the load-bearing correctness change; it must be covered by a test that a unit whose
  lease overlaps a running unit is NOT co-dispatched under streaming.
- Pillar-1: the lease (overlapHolder) is the real safety check and stays; tick/wave is scaffolding.
- This is the largest structural change; it may land behind a flag (streaming vs. tick) so it can be
  proven against the existing tick behavior before becoming default. Part B works under either.

### Part E — Issues 13 + 14: round-trip amplification, per-run budget, granular resume

Issue 13:
- Checkpoints-as-(near)-code. Today each checkpoint is an agent PAIR (read + write) with the ENTIRE
  run.json inlined → O(n^2) prompt growth (mitosis.js:2610/2622/2643/2655/2676/2688). The Workflow
  script has no fs, so persistence still needs an agent — but the fix is: the engine holds run state in
  memory (immutable) and each checkpoint dispatches ONE minimal-token mechanical writer that appends
  only the NEW record (a delta), never the whole file; the read side reads run.json ONCE at launch
  (resume), not per-checkpoint. This removes the quadratic and the read-agent. The writer is mechanical
  (Sonnet / bash-only), no LLM decision.
- Per-run budget + backoff (fail-closed). `retryState` (mitosis.js:2434, `max: 2*msps.length`) is DEAD
  CODE — `supervisedEngineDispatch` (:2129) hardcodes `attempts:1` and never consumes it. Wire a real
  per-run budget consumed by the dispatch/remediation paths; add bounded backoff between remediation
  cycles; when exhausted, PARK fail-closed (never spin). Optionally also gate on the Workflow `budget`
  global as a hard ceiling. Remediation cycle cap already exists (REMEDIATION_BUDGET=4); add the
  per-run aggregate cap.
- Review multiplicity is handled by Part A (reviews pinned, models validated) + the separately-approved
  Issue 7 (review-optimization); this SPEC does not duplicate Issue 7.

Issue 14:
- Granular per-MSP resume hash. The whole-spec content hash (mitosis.js:1138-1148) is all-or-nothing:
  any spec byte-edit invalidates ALL reuse → full Opus re-decompose. Replace with a per-MSP content
  hash so editing MSP-K's slice invalidates only MSP-K's checkpoint; unaffected MSPs replay-forward-skip
  via the existing observe-then-converge idempotency (mitosis.js:2735-2758, kept + extended). Degrade
  rule unchanged: a changed/absent/malformed per-MSP hash degrades ONLY that MSP to a fresh decompose;
  it never halts or crashes the run.
- Dependent branch-from-upstream (stacked pipelining) is DEFERRED (the dependent integration branch is
  cut from bare origin/<base> at :2910-2912; letting a dependent build on an un-merged upstream's
  durable checkpoint is the deferred stacked-PR lever). Part B's poll is the chosen in-scope unblocker.

---

## 6. Task decomposition (implementable, dependency-ordered)

Each task is RED-first, twin-mirror-consistent (mitosis.js inline twin + run-engine.mjs, mirror-guard
green), and dual-reviewed (code + security). "Acceptance" is the observable, test-backed criterion.
Grouping matches Parts A-E; within a part, tasks are ordered by dependency.

A0. `planIncomplete` placeholder-lint (R8-1). Pure function + unit tests (RED: a plan with "TODO"/"..."
    /empty RED step returns true; a complete plan returns false). Acceptance: deterministic, no I/O.
A1. `policyModelFor(task)` + signal helpers: `sensitiveScope` (glob table via scopeCovers),
    `irreversible`, `breakingContract`, `blastRadius` (expose the reverse-transitive-dependents count
    from derive-edges.mjs:86-89), `risk` ratchet-up. Pure + table-driven tests covering each Layer-1
    trigger, the Layer-2 fail-safe (missing signal → opus), and the single Layer-3 sonnet path.
    Acceptance: every categorical trigger → opus; only the fully-clear implementer path → sonnet.
A2. E1 schema field `model` on the task shape (graph contract + tasks map mitosis.js:2851) with the
    engine authoring it from A1. Acceptance: graph round-trips `model`; LLM-authored `model` is ignored.
A3. E2 invariant (extend after mitosis.js:2901): per-task model whitelist + `=== policyModelFor` +
    `engineArgs.models` deep-equals operator input. RED: a task with a mismatched/echoed model parks.
A4. E3 guarded dispatcher wrapping every engine `agent()` (replaces raw withModel model args in
    run-engine.mjs + twin). RED: a dispatch attempting a non-policy model parks; a review dispatch not
    on Opus parks. Acceptance: all 10 engine dispatch sites route through the guard.
A5. E4 review pins (plan-review + spec/quality/merged/security explicit 'opus') + E5 knob hardening
    (whitelist models.* to {opus,sonnet}; models.reviewer upgrade-only/deleted). RED: `models.reviewer:
    'haiku'` is rejected/parked; security review never runs below Opus.
A6. E6 redispatch model-drop fix + R8-3 BLOCKED/exhausted→Opus escalation + model assertions in
    tests/run-engine.test.mjs. RED: a redispatched task keeps its policy model; a BLOCKED Sonnet task
    escalates to Opus on the gate-triggered retry.
A7. Diagnostician agentType resolution (define or re-point) — or rely on E3's unknown-agentType→Opus
    fail-safe with a test asserting it.
A8. R8-4 flip (LAST, gated on A0-A7 green): Layer 3 begins emitting 'sonnet' for discretionary
    implementer tasks. One reviewed, revertible commit. Acceptance: a plan-complete, non-categorical,
    low-blast-radius implementer task dispatches Sonnet; everything categorical/uncertain stays Opus.

B1. `'awaiting'` unit state + `dispositionOf(AwaitingApproval) → 'awaiting'`. RED: an awaiting unit is
    not counted as parked and not counted as done.
B2. Repo-scoped, fail-closed merge-watch dispatch + strict result schema (§4). RED: a wrong-repo /
    readError / non-MERGED read is treated as NOT merged; only `MERGED && mergedAt` transitions to done.
B3. runSchedule continuation + `progressPossible` + max-poll-cycle budget + fail-safe park (§Part B).
    RED (the headline test): a 2-root/14-dependent graph where the merge-watch is stubbed to report the
    roots merged after cycle 1 ships far more than 2 in a single run; with the watch reporting never-merged,
    it parks exactly as today (no regression). Assert the poll path issues no merge/push.

C1. Decompose doctrine reversal at mitosis.js:2413 (coarse → narrowest-correct) + coarse-scope lint
    that FLAGS (not auto-narrows) for the reviewer. RED: a bare top-level-dir scope is flagged.

D1. CI-watch backgrounded + `timeout`-bounded, returning terminal conclusion (Issue 11 pre-merge
    pipelining of rebase/push/PR/CI-start for the next ready MSP while the current CI runs). RED: two
    ready MSPs' pre-merge work overlaps in time; only the merge step serializes.
D2. Streaming dispatch behind a flag with per-RUNNING-unit lease hold/release (Issue 12). RED: a unit
    whose lease overlaps a RUNNING unit is not co-dispatched under streaming; a diamond/sibling graph
    achieves >1.0 width. Default remains tick until proven; Part B works under both.

E1t. Checkpoints as delta-append writers (drop the read-agent; read run.json once at launch; append
    only new records). RED: an n-MSP run issues O(n) checkpoint writes, not O(n^2), and no checkpoint
    inlines the whole run.json.
E2t. Wire the per-run budget (consume retryState in the dispatch/remediation path) + backoff +
    fail-closed park on exhaustion. RED: an infinite-remediation stub parks at the budget instead of
    spinning.
E3t. Granular per-MSP resume hash replacing the whole-spec hash (mitosis.js:1138-1148). RED: editing
    MSP-K's slice invalidates only MSP-K; unaffected MSPs replay-forward-skip; a malformed per-MSP hash
    degrades only that MSP to fresh decompose (never halts).

Dependency order: A0 → A1 → A2 → A3 → A4 → A5 → A6 → A7 → (B1 → B2 → B3) can proceed in parallel with
C1 and E-series once A4 exists; D2 is the riskiest and lands last-but-one; A8 (the flip) is the final
gate after all A/B/E green. C1 and D1 are low-coupling and can land early.

---

## 7. Verification & rollout

- RED-first for every task; a test that never failed proves nothing (testing.md).
- mirror-guard.test.mjs green after EVERY task (twin parity). The mitosis-scheduler and run-engine
  suites must stay green; new behavior adds tests, does not weaken existing ones.
- Dual review per task: code-reviewer + security-reviewer (security is load-bearing on Part A's
  fail-closed invariants and Part B's never-merge guarantee).
- Additive landing (OD-11): build the machinery with the implementer default still Opus (Layer 3 emits
  Opus until A8), integrate as one reviewed swap, THEN flip. Do NOT dogfood mitosis on itself during
  the rebuild — validate on a disposable throwaway repo / scheduler unit tests, not on this branch.
- Acceptance for the whole SPEC: (1) a foundation-first N-MSP graph ships >|root antichain| in one run
  when merges are approved mid-run, and parks with no regression when they are not; (2) a plan-complete
  low-risk implementer task dispatches Sonnet while every categorical/uncertain task and every review
  dispatches Opus, enforced by a fail-closed invariant the LLM cannot bypass; (3) no Pillar-1 floor item
  (§3) is weakened; (4) no engine auto-merge on any path.

---

## 8. Open questions for the user (non-blocking; defaults chosen)

1. Blast-radius K default. Recommend K = 3 for v1 (conservative; bias-to-Opus), documented for later
   calibration against repo revert history. OK, or a different starting K?
2. Streaming dispatch (D2) default. Recommend landing it behind a flag (tick stays default until
   proven), since it is the riskiest change and Part B does not need it. OK to keep tick as the v1
   default and flip to streaming in a later increment?
3. Merge-watch bound. Recommend a max-poll-cycle count (deterministic, script-side) with each cycle's
   wall-clock spacing set by the agent-side `timeout` (e.g. a bounded number of ~minutes-long watches).
   OK, or do you want an explicit overall wall-clock ceiling surfaced as a run arg?
4. Ship-stage model. Recommend keeping ship on Opus (consequential publish + rebase-conflict judgment,
   one dispatch per MSP). OK, or tier it later?
