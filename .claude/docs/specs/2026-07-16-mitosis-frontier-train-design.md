# Mitosis Deferred-PR Frontier Train + Idempotent Shepherd

Status: draft (awaiting user review)
Date: 2026-07-16
Thread: mitosis-frontier-train
Branch: feat/mitosis-robustness
Supersedes/builds on:
- decisions/2026-07-16-mitosis-frontier-train-architecture.md (A5 chosen; A1-A4 rejected)
- decisions/2026-07-16-mitosis-idempotent-shepherd-runlifetime.md (run lifetime = idempotent shepherd)
- decisions/2026-07-14-mitosis-ship-means-green-ci-not-merged.md (ship = green CI, human merges)

## 1. Problem

Large specs (continuity-ledger 16 MSPs, or ~30 across 4+ layers) stall Mitosis. Under the human-gated default an MSP PR opens green but stays `awaiting` until a human merges, and a dependent needs its prereq in state `done` (= merged). So one run ships only the root antichain (~1 layer), then parks the rest and asks for a relaunch. Flipping `STREAMING_DISPATCH_ENABLED` does not fix it: both schedulers share one readiness rule that requires `prereq.state === 'done'`.

Goal: let one logical Mitosis run plan, build, verify, and ship an entire spec as individual human-reviewed per-MSP PRs, with a machine build frontier racing ahead of the human merge frontier under a bounded, self-tuning gap, the human review/merge gate on every merge to `main` inviolable (Pillar 1).

## 2. Goals / Non-goals

Goals:
- A build frontier that builds each MSP eagerly on its parents' green-but-unmerged tips, and a merge frontier that opens each MSP's PR only once its parents have merged (clean small diff vs real `main`).
- One build run drains the whole spec continuously when review keeps pace; a near-zero-cost reconcile-only shepherd relaunch advances the frontier when review is slow.
- Every merge to `main` stays human-gated. No open PR is ever force-pushed.
- Default-off behind a flag; mainline behavior is byte-identical until the flag is set.

Non-goals:
- A1 eager all-PRs-open stacking (deferred as a possible later opt-in flag).
- A2 shared integration branch / A3 GH-merge-queue / A4 jj substrate (rejected in the architecture decision).
- An LLM that sizes the gap window (research-rejected; see Section 7.3). LLM risk is ordering + shadow-mode only.
- A bespoke scheduler daemon for shepherd relaunches (the operator drives cadence via cron / loop / manual).
- Active push notification on park (deferred; park is surfaced via persisted records + report + status line).

## 3. Verified current-state anchors

Confirmed by audit on branch `feat/mitosis-robustness` (2026-07-16). Every mechanism below has an exact anchor; edits to any of the 19 mirror-guard twins must land in both the `.mjs` and its inlined block in `mitosis.js` (`mirror-guard.test.mjs`).

- Readiness: `isDispatchable` (`leases.mjs:48-55`, twin `mitosis.js:1778`) blocks unless every prereq is `state === 'done'`. Both schedulers funnel through it (`leases.mjs:74`, `:161`). States in use: `planned`, `dispatched`, `done`, `awaiting`, `parked`.
- Provenance gap: `mspContentHash` (`recovery.mjs:67-81`) hashes `[id,title,rationale,dependsOn,fileScope]` only. `persistBuiltCheckpoint` (`mitosis.js:3185-3205`) is called with `sha: null` hardcoded (`mitosis.js:3524`). `receiptsPass`/`d6Pass` are computed by the ship agent but held in-memory only; no durable green marker exists. Checkpoint refs are `refs/mitosis/<runId>/<unitId>` (`checkpoint.mjs:6`).
- Worktree base always `origin/<baseBranch>` (`mitosis.js:3460-3470`, and `runEngine` at `928`/`962`). No build-on-unmerged-parent concept.
- Merge poll: `MERGE_POLL_MAX_CYCLES = 6`, `MERGE_POLL_WAIT_SECONDS = 300`, `MERGE_POLL_INTERVAL_SECONDS = 30` (`mitosis.js:3622-3624`). `pollsUsed` is incremented once per poll cycle (`leases.mjs:131`/`:199`) and never reset. On exhaustion the scheduler `break`s (`leases.mjs:145`/`:213`) and leaves units silently in `awaiting` (not parked, no alert). Co-binding outer step bound `maxSteps = units.length + 1 + maxPollCycles` (`leases.mjs:116`; streaming `2*units.length + maxPollCycles + 2` at `:174`).
- Merge re-entry works: `markMerged` flips a merged prereq to `done` (`leases.mjs:142`), and the next iteration re-runs `planTick` and dispatches newly-unblocked units in the same run. There is no phase wall.
- Ship-rebase primitive (`mitosis.js:3570`) rebases the boundary-validated local integration branch onto `origin/<baseBranch>`; conflict -> park.
- Reconcile: `computeRemaining`/`reconcileBuiltSet`/`mergePaginated` (`reconcile.mjs`) + `selectPreservedBuilt` (`parking.mjs:129-158`). Relaunch today re-plans when the spec changed and rebuilds non-preserved units; merged detection is always live via `gh pr list --state merged`.
- Park: `parkUnit` (`mitosis.js:3143-3161`), `persistParkCheckpoint`, `transitiveDependents` (`parking.mjs:34-50`). No active human notification. Resume via `selectResumeUnits` on relaunch.
- AIMD / gap window: absent. No cap on how far the build frontier races ahead of merges.
- Invalidation / reset-descendants on parent content change: absent. `selectPreservedBuilt` checks a unit's own hash but never walks the graph for upstream drift.
- Scheduler flag: `STREAMING_DISPATCH_ENABLED = false` (`leases.mjs:218`); the only `runSchedule` call passes no `opts`, so the tick scheduler is always live.

## 4. Architecture: the two-frontier model

Two frontiers advance independently:
- Build frontier (machine): builds each MSP as soon as its prereqs are green-built, rooted on their checkpoint refs, bounded by the AIMD gap window `W`.
- Merge frontier (human): advances only on human approval + merge to `main`; a unit's PR opens only when all its prereqs are merged.

Unit lifecycle:

```
planned --build--> built(green, PR deferred) --parents merged--> awaiting(PR open) --human merge--> done
    ^                     |
    +---- invalidate <----+   (only when a merged parent's content diverged from what the child was built on)
```

`built` is a new state: it equals today's "ready to ship" (green CI per the 2026-07-14 decision), minus opening the PR. The PR is deferred to the merge frontier so it presents a clean small diff against real `main`.

The whole feature is gated by `FRONTIER_TRAIN_ENABLED` (default `false`, defined byte-identically in `leases.mjs` and its `mitosis.js` twin). Off => exact current behavior.

## 5. Internal layering (bottom-up, for plan-to-task-graph)

L1 Foundation -> L2 Two-frontier core -> L3 Controllers -> L4 Lifecycle. Each layer depends only on those below it.

### L1. Build provenance (foundation)

The one true code prerequisite from the architecture decision, refined so provenance stays orthogonal to the decompose fingerprint (Refinement C, approved).

- Do NOT fold parent SHAs into `mspContentHash` (that hash detects spec edits and must stay a pure decompose-content fingerprint).
- Add a separate provenance record on the built checkpoint delta:
  - `builtSha`: the real git tip SHA of the built unit (replaces the hardcoded `null` at `mitosis.js:3524`; thread the real SHA through `persistBuiltCheckpoint`).
  - `green: true`: the persisted CI-green marker (promote the in-memory `receiptsPass`/`d6Pass` signal into the durable delta at the point the unit becomes `built`).
  - `builtAgainst: { <parentId>: <sha>, ... }`: the parent tips this unit was built on. This is the input to invalidation (L3).
- Twins touched: `recovery.mjs` / `checkpoint.mjs` and their inlined blocks. Add to the mirror-guard expectations if a new twin field is introduced.

Green definition: a unit is green-built when its Execute stage plus its per-MSP boundary/receipts/D6 validation pass (the same gate that today precedes opening a PR). Green-built therefore equals shippable-per-2026-07-14, PR merely deferred.

### L2. Two-frontier core

Split the single merge-gated readiness rule into two predicates and add the continuous-drain scheduler semantics.

Build readiness (`isBuildable`, new): a unit may build when
1. every prereq is in `{built, awaiting, done}` (green, so its checkpoint ref is safe to root on), AND
2. no file-scope lease overlap (`overlapHolder`, unchanged), AND
3. the built-but-unmerged count is `< W` (AIMD gate, L3).

The child's worktree roots on a local branch composing its prereqs' checkpoint refs (sequential restack of `refs/mitosis/<run>/<parentId>` for each parent, then the child on top). Any compose/restack conflict -> fail-closed park (L4).

PR-open readiness (repurpose `isDispatchable`): keep its exact current meaning (all prereqs `done`) but use it as the PR-open gate. When a `built` unit's prereqs all reach `done`, restack its unpublished branch onto `origin/<baseBranch>` and open its PR: `built -> awaiting`.

Continuous-drain scheduler (fold-in, both schedulers, twinned in `leases.mjs` + `mitosis.js`):
- Reinterpret the poll budget from "total polls per run (a drain ceiling)" to "consecutive fruitless polls (a stall detector)". Reset `pollsUsed = 0` inside the `merged.length > 0` progress branch (`leases.mjs:142`/`:210`, twins `mitosis.js:1872`/`1940`).
- Re-anchor `maxSteps` on progress (or scale it) so the outer step bound does not become the new binding limit (`leases.mjs:116`/`:174`, twins `mitosis.js:1846`/`1904`).
- Effect: under fast review the single build run drains the whole spec continuously; the 6-cycle limit bites only on genuinely consecutive fruitless polls (slow review), which becomes the clean handoff point to the shepherd.

New `built` state must be added to the disposition/readiness enums and to `isDispatchable`'s early-return guard so a `built` unit is not re-dispatched for build.

### L3. Controllers

AIMD gap window `W` (Zuul-shaped; Section 7 records the rationale):
- Start `W = floor` (default 3). `+1` per clean human approval/merge. On a `CHANGES_REQUESTED`, `W = max(floor, ceil(W/2))`. Ceiling ~6-8.
- Build readiness gates on `built-but-unmerged count < W`.
- `W` persists in `.mitosis/run.json` so the shepherd carries it across relaunches. `floor`, `ceiling`, increment are env-tunable constants (mirror the existing `MERGE_POLL_*` constant style).
- Updated at reconcile/poll time, where PR states (`merged`, `CHANGES_REQUESTED`) are already read. No estimate of `p`; AIMD self-tunes.

Conflict-scoped invalidation:
- When a parent merges, compare its merged content against the child's recorded `builtAgainst[parent]`.
- Identical (squash preserved content, the common case) -> nothing invalidated; descendants stay valid; approvals preserved.
- Diverged (squash/amend changed content) -> reset only true descendants (via `transitiveDependents`, `parking.mjs:34-50`) to `planned`, drop their checkpoints, rebuild on the new tip. Never the whole suffix.

### L4. Lifecycle

Approval preservation, structural (Refinement F, approved). GitHub has no Gerrit vote-copy, so preservation is structural:
- Restacks happen only on unpublished (`built`) branches. Once a PR is open (`awaiting`), its branch is frozen: never rewritten, never force-pushed.
- Edge case: invalidation (L3 divergence) hits a unit whose PR is already open. Resolution: fail-closed park it and supersede with a fresh PR (new branch) whose body carries an interdiff vs the superseded PR, so the reviewer sees only what changed. Never force-push the open PR.

Idempotent shepherd entrypoint (Refinement G, approved):
- A new reconcile-only mode. Trigger: flag/auto-detect (logical run exists + spec byte-identical + persisted frontier state).
- It does no decompose, no plan, no Execute/rebuild. It only: reads live PR states + checkpoint refs + persisted frontier state; advances the merge frontier (restacks unpublished branches, opens each next-layer PR as parents merge); updates AIMD `W`; and on divergent-invalidation parks the affected subtree and flags "build run needed" rather than re-running Execute (rebuild is outside reconcile-only's charter; clean restacks it does handle).
- "One logical run" = one build run (all Execute + root-antichain PRs) + N near-zero-cost shepherd relaunches. Scheduling substrate (cron / loop / manual) is the operator's choice.

Fail-closed parking extensions (extend `parkUnit`, `mitosis.js:3143`):
1. checkpoint-ref compose/restack conflict when rooting a child on its parents,
2. divergent-invalidation on an already-open PR (park + supersede, L4 above),
3. ambiguous frontier state (checkpoint ref missing/moved, or `builtSha` mismatch vs recorded provenance),
4. replace the current silent merge-poll-exhaustion dangle with an explicit persisted `awaiting-merge` state the shepherd owns.

## 6. LLM risk: ordering + shadow-mode only (not window-sizing)

Approved role for LLM risk assessment:
- Ordering: schedule the riskiest MSPs earliest, so any change-request arrives while the build frontier is shallow and cheap to invalidate. A wrong ordering costs nothing (same work, different sequence; cannot touch Pillar 1 or 2).
- Shadow mode: log each MSP's LLM risk score alongside the observed approve / change-request outcome. If, over many runs, the scores prove calibrated (Brier / AUC against outcomes), a later gated follow-on may promote them to an initial-`W` prior. The prior may never override multiplicative decrease.
- LLM risk does NOT size `W`. See Section 7.3 for the evidence.

## 7. Rationale (research-backed)

### 7.1 Two-frontier over the rejected alternatives
Recorded in the architecture decision: A1 eager stacked-PR train force-pushes open PRs and hits squash phantom-conflicts on published refs; A2 shared integration branch produces murky per-MSP diffs and whole-suffix invalidation and risks the forbidden mega-PR; A3 GitHub merge-queue has no dependent-PR concept; A4 jj is an XL VCS swap to soften one subcase A5 already parks.

### 7.2 Continuous drain
Audit verdict: the loop already interleaves dispatch and poll (merge re-entry works), but `pollsUsed` is monotonic, so a chain drains at most 6 layers per run regardless of merge speed. The stall-detector reset (L2) makes one run ride the frontier train to completion under fast review, with the shepherd as the slow-review fallback.

### 7.3 AIMD over static and over LLM-sizing
- Nearest production analog: Zuul's gating pipeline ships AIMD with the exact proposed shape (floor 3, +1 increase, halve on failure) for the same problem class (speculative execution ahead of a merge point). https://zuul-ci.org/docs/zuul/latest/gating.html
- Cost asymmetry under Quality > Optimization > Speed: overshoot (W too high, change-request lands) wastes re-runnable speculative builds (Pillar 2, tokens); undershoot (W too low) idles the frontier (Pillar 3, wall-clock). Undershoot is the cheaper error, so the controller must be slow to open, fast to slam -- AIMD's exact shape.
- LLM-sizing rejected: zero-shot LLM confidence is systematically overconfident (Xiong et al., https://arxiv.org/abs/2306.13063), and overconfidence maps onto the expensive error (opens W wide right before a change-request). Every successful predictive precedent (Uber SubmitQueue's ~97% model, https://dl.acm.org/doi/pdf/10.1145/3302424.3303970; CPU branch predictors; classical review-outcome ML at AUC 0.84-0.88) is a trained, history-fed predictor; none validates zero-shot semantic risk-scoring as a control input. The actuation space is ~4 integer values, so prediction's upside is a few window-slots of wall-clock (Pillar 3) bought with tokens (Pillar 2) and scheduler nondeterminism (Pillar 1) -- backwards on the pillar order.
- Short-episode precedent: with sparse feedback (a handful of review events per run), AIMD acts as a conservative initial condition plus a fast-back-off safety valve; the sparse-feedback gap is closed by the initial value, not prediction (TCP's own fix for short flows was a static initial window, RFC 6928, https://www.rfc-editor.org/rfc/rfc6928.html).

## 8. Flag gating and twin-sync

- `FRONTIER_TRAIN_ENABLED` (default `false`) in `leases.mjs`, defined byte-identically in its inlined twin. Off => exact current behavior (merge-gated readiness, monotonic poll budget).
- Twins touched by this spec: `leases.mjs` (readiness split, `built` state, scheduler reset, flag), `recovery.mjs` / `checkpoint.mjs` (provenance), `parking.mjs` (invalidation descendant-set, park extensions), `remediation.mjs` / `supervisor.mjs` (park), `reconcile.mjs` (shepherd reconcile). Every edit lands in both the `.mjs` and its `mitosis.js` block; `mirror-guard.test.mjs` enforces it.
- `persistBuiltCheckpoint`, ship-rebase, worktree-base, merge-poll constants are `mitosis.js`-only today; their edits are not twin-guarded but must stay consistent with the twinned logic.

## 9. Testing and acceptance

Unit tests (RED-first, on the pure `.mjs` twins, public-surface only; admitted under the test gate as new behavior with no existing coverage):
- readiness split: `isBuildable` (green prereqs, lease, W gate) vs `isDispatchable` (merged prereqs);
- continuous-drain: poll budget resets on merge progress; a 7+-layer chain drains in one run when every poll makes progress; stalls after `floor` consecutive fruitless polls;
- AIMD: increase per clean approval, halve on change-request, respect floor and ceiling, persistence across a simulated relaunch;
- invalidation: identical merge -> no descendant reset; diverged merge -> exactly the true-descendant set reset;
- provenance: `builtSha` + `green` + `builtAgainst` persisted; `mspContentHash` unchanged;
- park extensions: each of the four triggers parks fail-closed; merge-poll exhaustion yields a persisted `awaiting-merge`, not a silent dangle.

DoD gate (blocking): a synthetic 3-layer fixture spec (~2-3 trivial-but-real MSPs per layer, real `fileScope`, real CI, throwaway branch) run end-to-end with `FRONTIER_TRAIN_ENABLED` on, demonstrating: build-frontier-ahead-of-merge, PR-defer, restack-on-merge, one divergent-squash invalidation resetting only true descendants, and a shepherd relaunch advancing the frontier. Deterministic, no dependence on days of human review.

Follow-on (non-blocking): continuity-redesign-v2 (16 MSPs, 8/16 merged) as real-world validation.

## 10. Deferred / open

- A1 eager-all-PRs-open mode as a later opt-in flag for cross-layer review pipelining.
- Promotion of shadow-mode LLM risk scores to a calibrated initial-`W` prior (gated on demonstrated calibration).
- Active push notification on park (Slack/issue) -- out of scope; park is surfaced via persisted records + report + status line.
- Multi-parent checkpoint-ref compose strategy detail (sequential restack vs octopus) to be finalized in the implementation plan.
- Bootstrapping note for the plan: this spec modifies Mitosis itself, so implementation runs via ordinary implementer subagents, not via Mitosis on itself.

## 11. References

- Zuul gating (AIMD window): https://zuul-ci.org/docs/zuul/latest/gating.html
- Chiu and Jain 1989 (AIMD stability/fairness): https://en.wikipedia.org/wiki/Additive_increase/multiplicative_decrease
- RFC 6928 (TCP initial window, short-flow precedent): https://www.rfc-editor.org/rfc/rfc6928.html
- Astrom and Murray, Feedback Systems (feedforward vs feedback): https://www.cds.caltech.edu/~murray/books/AM05/pdf/fbs-principles_13Jan14.pdf
- Uber SubmitQueue (trained predictive gating): https://dl.acm.org/doi/pdf/10.1145/3302424.3303970
- Xiong et al. (LLM overconfidence/calibration): https://arxiv.org/abs/2306.13063
