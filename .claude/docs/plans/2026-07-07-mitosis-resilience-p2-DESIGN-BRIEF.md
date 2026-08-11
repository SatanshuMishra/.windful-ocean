# Mitosis Resilience — Increment 2 (Pillar 2) Plan Design Brief

Date: 2026-07-07. Status: design ready; plan not yet written. Bridge artifact so a fresh session writes/executes the plan WITHOUT re-running the 170k-token engine analysis.
Inputs: spec `~/.claude/docs/superpowers/specs/2026-07-07-mitosis-resilience-hardening-design.md` §6; audit brief `.claude/docs/2026-07-07-mitosis-resilience-audit-research-brief.md`; scope decision `.claude/ledger/decisions/2026-07-07-mitosis-resilience-p2-scope.md` (USER-RATIFIED).
Engine: `~/.claude/workflows/mitosis.js` (post-P1; same inode as repo `.claude/workflows/mitosis.js`). Twins under `~/.claude/lib/superpowers-parallel/`. Tests under `.../tests/`. Node v26; whole-suite = `node --test tests/*.test.mjs` from the lib dir. Branch: `feat/mitosis-resilience` (P1 = commit 2ee8720). 7 pre-existing generate-run-script.test.mjs failures are unrelated.

## Ratified scope (do NOT re-litigate)
Minimal-correct P2. Retry = immediate single re-dispatch (maxAttempts + deterministic run-level retry-count budget), NO timed backoff. OMIT literal backoff/jitter + per-dispatch timeouts (no clock/RNG/sleep -> would break prefix-replay determinism, Pillar 1; harness agent() already backs off + times out -> null). DEFER per-run deadline/checkpoint-exit to Increment 3 (budget non-deterministic; only safe with P3 reconcile+manifest). Retry ONLY non-shared-ref dispatches; ship + prepare-base-push retry -> Increment 3/P4 (local reset can't undo a push = garbled-second-PR risk). Outcome mapping: retry-exhausted -> quarantined (worktree preserved + redrive hint); clean gate-red/conflict -> halted; unexpected throw/null-deref -> crashed.

## Current change sites (post-P1 line numbers — VERIFY by content anchor, they drift on every edit)
- Decompose agent: mitosis.js:676-694 (top-level; try/catch -> fatalReport; anchor `decompose agent threw before fan-out`). READ-ONLY -> retryable (shared-fate: bounded-retry-then-fail-fast).
- Prepare agent + base commit/push: :727-751 (anchor `prepare agent threw before fan-out`; push is PROMPT TEXT at :738). NOT retried in P2 (base-push unsafe until P4); keep P1 fail-fast.
- Implementer dispatch: :421 inside `runTask` (which is inside `runEngine`, the run-engine.mjs twin). RETRYABLE + worktree-reset. THE HEADLINE.
- Wave parallel() barrier: :456 (`outcomes.filter(o=>!o||!o.ok)` at :457 already degrades gracefully — good).
- runClusterChain: :757-929 (top-level `async function`). Loop over MSPs: Plan :765 -> Harden :777 -> Branch :866 -> Execute/runEngine :881 -> Ship+mergeQueue :894-926. Returns `{halted:false}` @928 or `{halted:true,stage,mspId,detail}`. Plan/Harden/Branch dispatches have ZERO null-guard (null -> raw TypeError). Plan/Harden READ-ONLY-ish pre-worktree -> retryable (no reset). Branch = guarded-not-retried in P2.
- Outer parallel over clusters + assembleRunReport: :931-932 (LAST two statements; old silent-swallow `.find` ALREADY replaced by P1 — do NOT re-fix). :931 = LOW-1 unguarded fan-out await.
- mergeQueue: declared `let mergeQueue = Promise.resolve()` @:754; ONE link `mergeQueue = mergeQueue.then(()=>shipOneMsp(msp,clusterIds,i))` @:924 (NO .catch anywhere in file; mergeQueue is GLOBAL across clusters). Spec's :664/:833 two-site claim is STALE — only one site exists.
- shipOneMsp: :894-921, defined INSIDE runClusterChain's loop (re-declared per iteration, closes over repoRoot/integrationBranch/baseBranch/earlierInChain/shipped/aggregatedScope). Ship agent @:896; null-guard @:910; shipped.push @:919. NOT retried in P2.
- shipped[]: `const shipped=[]` @:753 (module scope, like the pattern to copy). Pushed @:919. Consumed by assembleRunReport @:932.

## Two existing twins + new one (mirror discipline — NO markers exist; byte-identical minus `export`)
- Twin 1: outcome.mjs (73 lines) <-> mitosis.js:59-131. Exports: shippedOutcome, haltedOutcome, crashedOutcome, quarantinedOutcome (DEFINED, NEVER CONSTRUCTED yet -> P2 is first consumer), computeOverallStatus, partitionOutcomes (buckets by kind incl quarantined), assembleRunReport, fatalReport. Partition side already handles quarantined -> P2 only needs to CONSTRUCT quarantinedOutcome.
- Twin 2: run-engine.mjs (271 lines) <-> mitosis.js:272-542 (schema consts + withModel/normalizePath/globToRegExp/scopeCovers/engineWorktreePath + `runEngine`). Signature `export async function runEngine(engineArgs, ctx)`, `ctx={agent,parallel,log,phase}`. runTask/reviewLoop/wave-loop live here. P2 edits here MUST be mirrored to BOTH files.
- NEW Twin 3: `retry.mjs` (pure). Import ONLY into retry.test.mjs + inline into mitosis.js; runEngine gets dispatchWithRetry via CTX (do NOT add an import to run-engine.mjs -> keeps its mirror byte-identical-minus-export). No drift guard exists today -> P2 ADDS `mirror-guard.test.mjs` (reads each .mjs + its inline mitosis.js range, strips `export ` and any `import ... from './*.mjs'` lines, asserts identical).

## retry.mjs interface (pure, injectable per spec §10)
- `classifyOutcome(result, isPermanent)` -> `'transient' | 'permanent' | 'ok'`: `result==null` -> 'transient'; `isPermanent(result)` -> 'permanent'; else 'ok'. Per-site `isPermanent` predicates: impl `r=>r.status==='BLOCKED'||r.status==='NEEDS_CONTEXT'`; decompose `r=>!Array.isArray(r.msps)`; plan/harden `()=>false` (any object is ok); branch `r=>!r.ready`.
- `withinRetryBudget({attempt, maxAttempts, state})` -> bool: `attempt < maxAttempts && state.used < state.max`. state = `{used, max}` shared mutable counter (matches file's `shipped[]`/`mergeQueue=` mutation style; JS single-thread makes check+increment atomic between awaits -> deterministic, no race).
- `resetPreamble(worktree, ref)` -> string: exact `git -C <worktree> reset --hard <ref>\ngit -C <worktree> clean -fdx\n` prepended to the re-dispatch prompt (engine has NO git — reset is PROMPT TEXT; testable via regex like P1's F3 test @mitosis-scheduler.test.mjs:434-450).
- `dispatchWithRetry(dispatchThunk, { classify, maxAttempts, state, resetRef, buildPrompt })` -> result-or-quarantine-signal. dispatchThunk = `(attemptNo) => Promise<result>` (agent-agnostic -> unit-testable with fake thunks). On transient + within budget: state.used++, re-dispatch (with resetPreamble prepended if resetRef given). On permanent -> return result (caller maps to halted). On exhaust -> return a sentinel the caller maps to quarantinedOutcome. Assert "at most maxAttempts, no inner retry loop" (no-amplification).
- resetRef for implementer = the WAVE BASE / integration branch NAME (already in runTask scope; stable during a wave since no merge happens before the barrier) -> NO git rev-parse / SHA capture needed.

## Retry surface (safety-scoped)
RETRY: decompose (then fail-fast), plan, harden, implementer (+reset). GUARDED-NOT-RETRIED: prepare, branch, ship, boundary, merge, fence (null/throw -> accurate crashed/halted/quarantined, no re-dispatch). SHARED-REF-PUSH retry (ship, prepare base-push) -> Increment 3/P4.

## Test injection patterns (from the analyst map)
- Seam: mitosis-scheduler.test.mjs:8-10 compiles mitosis.js body via `new AsyncFunction('args','agent','parallel','log','phase','workflow', body)`; call `runMitosis(argsJson, agent, parallel, log, phase, {})`. `trackedParallel` @:21-24 catches per-thunk -> null on reject (THIS is what makes F2b's null-from-parallel work). run-engine.test.mjs uses `ctxWith(agent)` @:38-45 with a parallel fake that has NO per-thunk catch (INCONSISTENCY — LOW-1: pin the rejected-thunk->null contract in a test so F2b + isolation can't silently regress).
- Transient blip fake: closure counter; return null for first N calls matching a `label` prefix, then delegate to `createFakeAgent`. Model on `crashingAgent` @:368-389.
- Headline test: null on 1st `impl:<task>` call, success on 2nd -> assert (a) 2nd prompt contains `reset --hard` + `clean -fdx` for that worktree, (b) MSP ships, (c) impl called exactly 2x (cap).
- Quarantine test: impl returns null EVERY time for MSP-b -> exhausts maxAttempts -> `result.quarantined` contains b (worktree-preserved asserted via prompt/redrive-hint regex), other cluster ships, `overallStatus==='partial'`.
- mergeQueue test: ship agent throws for cluster1's MSP -> cluster2's MSP still ships (proves .catch isolates the global mergeQueue), report partial.

## Task decomposition (each RED-first, independently reviewable; every task ends green on touched files)
1. retry.mjs pure core + retry.test.mjs (classifyOutcome, withinRetryBudget, resetPreamble, dispatchWithRetry with fake thunks incl. no-amplification cap). No mitosis.js change.
2. Inline retry.mjs into mitosis.js (block #3, after outcome block, before `function indexMsps`) + mirror-guard.test.mjs covering all THREE twins (strip export + retry-import lines).
3. Wire dispatchWithRetry into implementer dispatch (run-engine.mjs runTask uses `ctx.dispatchWithRetry`; mirror to mitosis.js; ctxWith adds it; thread retryState via engineArgs.retry + parse `args.retry={maxAttempts,runBudget}` @ input parse ~:641, defaults maxAttempts=3, runBudget=2*msps.length) + HEADLINE transient-blip test + no-amplification test.
4. Per-MSP-per-stage isolation in runClusterChain: guard/retry plan+harden (retryable), guard branch/execute (crashed/halted local outcomes, ACCURATE mspId+stage, chain stops), + quarantine wiring (construct quarantinedOutcome w/ redrive hint {branch,ref,stage}) + quarantine acceptance test (other clusters finish -> partial).
5. mergeQueue per-link `.catch` @:924 + LOW-1: guard outer fan-out await @:931 + test pinning harness parallel rejected-thunk->null contract + merge-queue-poisoning test.
6. Shared-fate: decompose bounded-retry-then-fail-fast (retry via dispatchWithRetry then fatalReport); confirm prepare stays fail-fast-only (documented no-retry) + tests.

## Gotchas
- Immutability rule: shared mutable retryState counter is consistent with the file's existing `shipped[]`/`mergeQueue=` style (writing-plans: follow established patterns) — note the rationale.
- runEngine uses `ctx.dispatchWithRetry` (works standalone-twin via test-ctx AND inlined-mitosis via passed ctx); top-level mitosis.js sites call the inlined `dispatchWithRetry` directly.
- "SDK already retries HTTP transients" is an ASSERTED (unverified-from-code) harness contract — the no-amplification guarantee rests on it; state as an assumption, don't claim it as a code fact.
- Every code edit to a twin -> update BOTH files + run mirror-guard.test.mjs.
