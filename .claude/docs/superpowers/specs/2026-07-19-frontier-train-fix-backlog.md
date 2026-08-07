# Frontier-Train Default — Blocking Fix Backlog (2026-07-19)

Status: integration branch `feat/mitosis-frontier-default` is built, de-gated (zero `FRONTIER_TRAIN_ENABLED`), and green (789/789, mirror-guard 22/22), but an independent Fable review returned **BLOCK**. Promotion to the default engine is deferred until C1 + H1-H4 are fixed. These are largely **pre-existing bugs in `feat/mitosis-frontier-train`** exposed by making the feature the unconditional default; the feature's own green e2e suite never covered the multi-relaunch *build* path.

Line refs are on `feat/mitosis-frontier-default` (worktree `.claude/worktrees/frontier-default/`); numbers may drift — re-confirm before editing. `mitosis.js` inlines the `lib/superpowers-parallel/*.mjs` twins; every source edit must land in BOTH copies (mirror-guard enforces byte-sync).

## Fix approach (decided 2026-07-19)
FABLE reasons out the solution first (one design pass over C1 + H1-H4 together — they interact), then dispatch OPUS subagent(s) to implement, in parallel where the fixes are independent. Re-review with Fable against design intent (not the co-rewritten tests). Add tests that cover the **multi-relaunch build path** and the **AIMD actuation path** (the two blind spots). Then promote.

## CRITICAL

### C1 — Reconcile-only mode hijacks every relaunch; build frontier deadlocks after run 1
- `mitosis.js:3445-3459` (`shouldReconcileOnly`, twin `reconcile.mjs:76-78`). `reconcileOnlyMode = shouldReconcileOnly({ isRelaunch, specByteIdentical: reusable, hasFrontierState: builtUnits.length > 0 })` and the branch `return`s at 3458 before resume/decompose/fan-out.
- `builtUnits` = "any `refs/mitosis/<run>/*` exists" (`mitosis.js:3409-3410`); checkpoint refs are pushed for every unit pre-ship (`mitosis.js:4157-4188`) and never deleted → after any first run, every relaunch of the same spec is shepherd-only. The shepherd only restacks/opens `status==='built'` units (`planReconcile`, `mitosis.js:2649-2656`); it never builds.
- Failure: 16-MSP/4-layer spec. Run 1 builds W=3 ahead, exhausts polls, exits with L3+ `planned`. Merge + relaunch → reconcile-only opens L2 PRs; later relaunches → `toOpen=[]`; L3+ never built, forever. `verb:'resume'` (`mitosis.js:3401-3407`) is itself hijacked. The `BUILD RUN NEEDED` flag (`mitosis.js:2870-2872`) is unreachable by any input.
- Fix direction: gate reconcile-only on "no buildable work remains" (all non-shipped/non-parked units built/published), OR make it an explicit operator verb, OR fall through into the build path after the shepherd advance instead of returning. Add a test: relaunch of a spec with `planned` units deeper than W still builds them.

## HIGH

### H1 — In-run AIMD never actuates (launch-time W snapshot)
- `mitosis.js:4401-4406` passes `{ window: currentWindow }` once; `runSchedule` snapshots it (`leases.mjs:284-290`, twin `mitosis.js:2087-2092`); `planTick`/`dispatchableStreaming` use the frozen integer all run. Updates at `mitosis.js:4380-4385` (`currentWindow = nextSize`) are invisible to the running scheduler. Mid-run CHANGES_REQUESTED never contracts the frontier; approvals never widen it.
- Fix: pass an accessor (`opts.window` as `() => currentWindow`) or thread window events through `poll.watch` results into the tick loop.

### H2 — Shepherd never generates AIMD events; CHANGES_REQUESTED never halves W across relaunches
- `buildReconcileLiveSignals` (`mitosis.js:2661-2678`) hardcodes `events: []` and uses `openPRs` only for `published`, discarding `reviewDecision` — the field the reconcile prompt step 6 (`mitosis.js:3376`) was extended to fetch. `planReconcile`'s `nextW` (`mitosis.js:2630-2634`) only re-persists prior W.
- Fix: map `openPRs[].reviewDecision` to approved/changes-requested events (deduped per PR — see M4) in `buildReconcileLiveSignals`.

### H3 — Frontier-compose runs for every dependent, even when all parents merged
- `mitosis.js:4081-4083` branches on `parentIds.length > 0`, not "any parent unmerged". Compose parks on a missing parent ref (`mitosis.js:4100` → `ready=false` → park 4112-4113), making the soft checkpoint hint load-bearing for every child; and a squash-merged-with-amendments parent (expected divergence) makes the child pointlessly restack stale parent commits onto a base already containing the parent → compose-conflict park.
- Fix: when every parent is in the done set, take the plain branch-from-base path (`mitosis.js:4120-4139`); only compose still-unmerged parents' refs (the shepherd restack at `mitosis.js:2799` already filters this way; the in-run path doesn't).

### H4 — Divergent-invalidation parks record `resumePoint.stage:'ship'` → invalidated stale build ships on resume
- `shepherdPark` (`mitosis.js:2747-2757`) used for `toParkSubtree` (`mitosis.js:2867-2869`) with stage `'ship'`; `selectResumeUnits` (`parking.mjs:96-110`) resumes at the recorded stage. Design L3 requires invalidated descendants reset to `planned`, checkpoints dropped, rebuilt. Latent behind C1; once C1 is fixed a diverged subtree resumes at ship and publishes condemned content.
- Fix: invalidation parks get `stage:'plan'` (as blocked-parks at `mitosis.js:4420-4424`) and drop their checkpoint provenance.

## MEDIUM (do before real multi-relaunch use)
- **M1** — Window bound not enforced within a tick and count undercounts the gap: `buildAheadWindow` (`leases.mjs:115-117`, twin `mitosis.js:1918-1919`) counts only `state==='built'`, computed once/tick; admission loop (`leases.mjs:124-132`, `220-228`) never decrements slots → with count `W-1` and k siblings, all k dispatch (frontier jumps to `W-1+k`); `awaiting`/`dispatched` uncounted. Fix: track admissions in-loop (`builtUnmergedCount + admitted < size`); decide whether `awaiting` counts.
- **M2** — Persisted window unclamped: `mitosis.js:3660` accepts any integer from folded `run.json` (`run-log.mjs:36` stores unvalidated); `nextWindow` (`window.mjs:5-10`) clamps only low side. Fix: clamp to `[WINDOW_FLOOR, WINDOW_CEILING]` at load and in fold.
- **M3** — Provenance wrong/dead: `persistBuiltCheckpoint` (`mitosis.js:3733-3735`) never passes `green` → `builtDelta` records `green:false` for green units (inverts design L1). `builtAgainst` captured (`mitosis.js:4115-4119`) but consumed by nothing; `assembleDivergenceVerdicts` (`mitosis.js:2616-2620`) compares `parent.builtSha` vs `mergedSha` → can report `clean` for a stale child base. Fix: pass `green:true` at built-persist; make the probe use each child's `builtAgainst[parent]`.
- **M4** — Approved re-observation inflates W: `mergePoll.watch` (`mitosis.js:4380-4385`) emits `+1` per poll cycle the same PR still reads APPROVED (design: +1 per event). Bounded by ceiling 8. Fix: dedupe events per PR per decision transition.
- **M5** — Frontier-only dispatches untiered (MSP-5a): no `model:` at `mitosis.js:2720` (divergence-probe), `2819` (shepherd-restack), `2854` (shepherd-open), `3722` (supersede), `3744`/`3766` (built/ship-checkpoint), `4326` (review-decision), `4352` (window-checkpoint). Pin destructive-git/PR-publish (restack/open/supersede) to opus; journal/probe/review reads to sonnet.
- **M6** — In-run merged-parent divergence never probed: `mergePoll.onMerged` (`mitosis.js:4388-4396`) releases dependents without the shepherd's `runDivergenceProbes` (`mitosis.js:2694`). Nets: ship-time CI (`mitosis.js:4243-4246`) + human review. Fix: probe divergence at in-run merge too.

## LOW
- **L1** — `markAwaitingMerge` skipped on natural `maxSteps` exhaustion (runs only on in-loop break, `leases.mjs:203-204`/`276-277`, twins `mitosis.js:2006`/`2079`). Move the transition after the loop.
- **L2** — Shepherd restack output consumed by nothing (`mitosis.js:2785-2829`); PR-open restores from the durable checkpoint ref, not the local branch. Optional simplification (Pillar 2 token cost per relaunch).

## Verified intact (no regression — do NOT re-touch)
No double-dispatch; `isBuildable` fails closed on non-integer window; `maxSteps` bounds hold; critical-path ranking (MSP-6a), base-census caching (MSP-6b), fold-CLI reconcile (MSP-5c), reviewLoop hardening, prompt distillation (MSP-5d) all intact; reconcile prompt union correct; `sha:null` gone (real tip threaded, fail-closed `requireSha`); Built deferral unconditional; frozen-PR invariant + human merge gate hold everywhere; twins byte-synced; no new comments, no secrets.

## Promotion procedure (after fixes + re-review pass)
Main repo has `core.bare=true` (dotfiles/stow) — main-tree git mutations need `GIT_WORK_TREE=<repo>`. Deploy is a symlink `~/.claude/workflows` → `<repo>/.claude/workflows`; `mitosis.js` is self-contained (inlines the engine), so updating that file on the checked-out branch is sufficient. Rules dirs are COPIED (not symlinked) — already edited in both repo and `~/.claude`.
1. `GIT_WORK_TREE=<repo> git -C <repo> add` the 3 rule files (`git-workflow.md`, `git/commits.md`, `git/pull-requests.md`) and commit (autonomous-commit policy now active).
2. `GIT_WORK_TREE=<repo> git -C <repo> merge feat/mitosis-frontier-default` into `feat/mitosis-robustness` (currently a clean 26-commit fast-forward; the rule commit makes it a small merge).
3. Verify `~/.claude/workflows/mitosis.js` now serves the frontier engine; run `npm test` from the repo.
4. Mark `.claude/ledger/decisions/2026-07-16-mitosis-frontier-train-architecture.md` and the design spec status → implemented.
