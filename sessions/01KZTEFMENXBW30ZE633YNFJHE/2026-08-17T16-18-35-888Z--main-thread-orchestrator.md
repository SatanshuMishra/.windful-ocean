E2E test of the shipped engine, session 2026-08-17. User approved a thorough end-to-end test with a disposable repository and minimal intervention.

INFRASTRUCTURE BUILT (all under scratchpad/e2e/, none of it in the repo)
- Disposable private GitHub repo SatanshuMishra/mitosis-e2e-substrate: a real Node ESM toolkit library, 28 passing tests, ci.yml plus receipts.yml carrying the receipts enforcer and pr-title-lint with the engine's exact pinned action SHAs. mitosis-gate matrix and the D6 step deliberately omitted, the latter because scripts/d6-check.cjs exists nowhere.
- Three SPECs with expectations PINNED before any run: spec-parallel (4 disjoint MSPs), spec-dependency (3-MSP chain), spec-overlap (2 MSPs editing one file).
- observe.mjs, a cost/concurrency/integrity reporter over run artifacts. 27/27 tests, two inertness mutations verified.
- A transparent passthrough timing shim for the claude binary on PATH. 19/19 tests, 13/13 inertness mutations detected.

FINDINGS ESTABLISHED WITHOUT THE LIVE RUN
- No engine module calls graphify. Confirmed by exhaustive search over 8373 files. Parallel-safety is decided solely by fileScope.edit string overlap.
- The engine does not stack pull requests. It parks blocked-pending-approval and stops.
- The engine cannot time itself. Every record carries the single --at constant, and recordOutput destroys the only start marker. The determinism gate is the cause. External instrumentation was required.
- CONFIRMED DEFECT: integratePhase never passes mergedShas to integrateBuilt, so divergedParents always fires and a dependency chain ships exactly one unit. The engine's own printed remedy, merge the prerequisite then relaunch, does not work.
- CONFIRMED DEFECT: a failed CI run-id read yields ci-unwatched, the pull request still opens, and merge-policy reports all-shipped. The tracked test e2e-ci-green.test.mjs:112-126 pins this false green as expected behaviour.
- The exec-allowlist gate attests a stdin fail-closed refusal the real shim does not perform, because the gate probes a mocked io while the runtime readFileSync(0) returns an empty buffer rather than throwing.
- Gate exits 41 and 42 are byte-identical on stdout, both empty. Only the numeric exit code separates a found violation from an unjudgeable halt.
- Guardrails that HELD: all ten merge specimens refuse, exec-policy provably cannot spawn since it never imports child_process, the bash hook denies all four PR-open forms with clean allow controls, and pr.mjs rejects all five malformed inputs before any network call.
- Fault behaviour that HELD: lock survives SIGKILL with the exact remedy string, retire clears it, relaunch resumes with restarted false and never redispatches a completed unit, redispatch budget is exactly 1, and the c23 stderr contrast holds with an undispatchable unit naming itself while a needs-human park stays silent.

GITHUB OUTAGE, and a lesson
A major GitHub outage ran through the middle of this session and blocked every ship and CI probe. It also surfaced the ci-unwatched defect, which would have been invisible on a healthy forge. On recovery the STATUS PAGE still reported major_outage on Pull Requests, Actions and API Requests while every previously-404 endpoint returned 200, including the engine's exact resolve-run argv. Empirical probing unblocked correctly where the status page would have kept the work stalled.

IN FLIGHT AT WRITE TIME
The live decomposition probe (5 real model calls, graded against pinned expectations) and the centerpiece live full-engine run against the disposable repo with real children and real pull requests.