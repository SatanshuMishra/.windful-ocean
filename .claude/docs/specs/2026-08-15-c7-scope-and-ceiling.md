# C7 scope and acceptance ceiling

Status: pinned before implementation starts
Date: 2026-08-15
Authority: decision 0450 (redispatch stays a judgment kind), decision 0451 (the engine keeps the tick loop and composes the pool per tick)
Governs: `feat/c7-loop`, cut from `feat/mitosis-os-process` at `995616e6`
Companions: `2026-08-12-mitosis-os-process-rearchitecture-design.md` section C7, `2026-08-15-cp-disposition-record.md` sections 3 and 5

This document is C7's G0 artifact under `receipts/gates@1.1`. Section 2 is the complete definition of done. Anything discovered above it is filed as a new item and never folded into the work in hand.

## 0. Corrected citations

The SPEC's and the disposition record's line references have drifted. Implement against the corrected column, not the published one.

| Subject | Published | Actual at `995616e6` |
|---|---|---|
| the tick loop | `mitosis.js:2544`, `:2552-2574` | `mitosis.js:2759-2781` |
| `joinTick` | included in the above | `mitosis.js:2750-2753` |
| quiescent exit | `mitosis.js:2563` | `mitosis.js:2768-2771` |
| `runSchedule` | not cited | `mitosis.js:2783-2787` |
| boundary dispatches | `mitosis.js:1695`, `:1704`, `:1706` | `mitosis.js:1730`, `:1737`, `:1740` |
| `appendRunJournal` | `mitosis.js:5574` | `mitosis.js:5607` |
| test root | `tests/...` | `.claude/lib/mitosis/tests/...` |

Two SPEC statements are factually wrong and C7 corrects them in the same PR: the section 2.3 row at `:138` pins redispatch to debugger/opus, while `mitosis.js:3779` dispatches it with the triggering stage's `agentType` and schema and `:3756` derives the model from the stage; the census line at `:54` inherits the same error.

## 1. What C7 is

`.claude/lib/mitosis/engine.mjs` and `.claude/lib/mitosis/cli.mjs` do not exist. C7 creates both.

Composition shape is fixed by 0451. The tick and epoch loop is retained in `engine.mjs`; each tick's dispatchable set runs through `pool.mjs::runGraph` as a fresh edgeless graph. `pool.mjs` is not edited and none of its 36 tests change. `leases.mjs`'s pure helpers are re-exported unchanged, and `leases.test.mjs`'s assertions are ported unchanged, including the tick barrier at `:431`.

Redispatch's home is fixed by 0450. It survives as the registered judgment kind it already is; the six mechanical `makeRemediation` attachments at `mitosis.js:4184`, `:4803`, `:4975`, `:5122`, `:5219`, `:5246` are detached, and their `engine.mjs` successors must not re-add them.

## 2. The acceptance ceiling

1. `engine.mjs` and `cli.mjs` exist and compose the shipped substrate. `runSchedule`, `runScheduleTick`, `joinTick` and `runEngine` have deterministic library homes.
2. Each tick's dispatchable set runs through `runGraph` with an `AbortSignal` threaded in and checked before the next `planTick`. A mid-run abort exits without re-planning and leaves every in-flight unit recorded.
3. Quiescent exit is preserved: an empty dispatch set marks awaiting-merge and returns the quiescent result.
4. The `runUnit` adapter maps tagged outcomes onto the pool's boolean `ok` contract without collapsing `Built` or `AwaitingApproval` into failure, and a throw lands where an `allSettled` rejection lands today.
5. An integration test runs a fixture spec end to end against a stubbed dispatch and produces the expected journal, refs and PR calls.
6. One test proves a tick wider than the concurrency cap completes fully across the cap with no lease violation.
7. Each of the nine inherited obligations in section 3 carries a disposition: discharged with a receipt, or re-filed with a named owner and a stated reason.
8. Redispatch's classification is implemented per 0450 and recorded in the PR body, discharging thread criterion c5's first half.
9. The three activated test-terrain items in section 4 are handled, not left vacuous.
10. The corrected citations in section 0 land in the SPEC.
11. Every acceptance test is red on the parent commit and green on its commit, and each ships an observed inertness mutation.

Declared behaviour change, intended rather than discovered: `planTick` imposes no count limit on dispatchable units, so a tick wider than the cap of 8 now serializes where it previously did not. This is the sole concurrency effect of 0451 and is not a defect.

## 3. The nine inherited obligations

Call sites verified at `995616e6`. Suggested landing order is left to right, top to bottom.

| Order | id | Verified site | Conversion requires |
|---|---|---|---|
| 1 | R7 | `prompt-registry.mjs` has zero production importers; both engines compose inline at `mitosis.js:1493` and `run-engine.mjs` near `:409` | route all registered kinds through `composePrompt`, then retire the prose-anchor guard in `tests/prompt-divergence.test.mjs` |
| 2 | B1 | `mitosis.js:1730`, `:1740` | inject `boundary-gate.mjs:174` at both sites |
| 2 | B2 | `run-engine.mjs:644`, `:654` | same commit as B1, or mirror-guard goes red |
| 3 | B3-rem | `mitosis.js:1740` passes `boundary.baseCensus` | delete `baseCensus` from the recheck path; stop trusting a model-returned base census |
| 4 | J1 | helper `mitosis.js:5607`; sites `:4482`, `:4739`, `:4764`, `:4823`, `:4845`, `:5659` | delete the helper and six dispatches; call `journal-store.mjs:231` and `:248` |
| 5 | J2 | `mitosis.js:5640`, `:5642`, `:5654` | pass `at` as an ISO instant and use `elapsedBetween` at `journal-store.mjs:326`; see the clock constraint in section 6 |
| 6 | T1 | `run-engine.mjs:570`, `:590` | convert both twins in the same commit as their `mitosis.js` counterparts |
| 7 | T5 | registered at `prompt-registry.mjs:37` and `prompt-contract.mjs:226-232`, no dispatcher | wire the library half; if the live path cannot exercise it before D1, that is `unverified-reasoned` with D1 named, never claimed as fixed |
| 8 | T4 | every converted site's `label:` must vanish | sweep, verified last |

## 4. What the conversion activates

Each of these is real, confirmed against the code, and inside the ceiling because C7 causes it.

1. **Vacuous scheduler assertions.** `mitosis-scheduler.test.mjs:679-681`, `:683`, `:714-716` assert that a dispatch label list is empty. They go trivially true once nothing dispatches, and `journal-store.mjs:25` relies on two of them to guard J6. Replace with an assertion on the write - no fresh-path `ship` line in the journal - not on an absent label.
2. **`makeDurableFakeAgent`.** `mitosis-scheduler.test.mjs:3268-3325` parses a balanced object out of the prompt into an in-memory file map. With a deterministic writer there is no prompt to parse; the double and its eleven call sites simulate a path that no longer exists.
3. **The deterministic writer refuses what the prompt path drops.** `journal-store.mjs:159-161` and `:167-172` throw where the incumbent genesis site at `mitosis.js:4483-4489` logs and continues. A converted genesis write therefore halts a run the incumbent completed. That is a behaviour choice C7 must make deliberately, and `journal-store.mjs:24` requires the ci-attempt path's throw specifically not to be swallowed.

## 5. Outside the ceiling

Filed forward, owned but not fixed here. Discovering more of these does not widen C7.

1. `plan` ignores `fileScope.truncated`, so a dropped path is invisible to the planner.
2. An empty `fileScope.edit` composes a diff with no pathspec, which git reads as no filter, silently widening the review target. This is the fourth instance of the fail-open class named in the disposition record section 6.
3. `fencedExcerpt` truncates after validation, so a cut can manufacture a delimiter-shaped final line.
4. A backtick inside an argv element still closes the markdown code span early.
5. `boundaryFixWhere`'s restatement re-emits only part of the fence it claims is unchanged.
6. `censusIdentity` hashes the census's own fields, so it authenticates nothing against the tree while its refusal text claims it binds one.
7. `usableCachedBase` recomputes expectations against a base worktree `collectSides` has already torn down.
8. `specHashProbes` exercises only an inline throwing stub, so the gate verb proves nothing about the real reader.

D1 owns the coupling-consumer question and the unbound task fields. `planWaves`'s missing task-shape validation remains unassigned.

## 6. Constraints that would otherwise surface as gate failures

- **The determinism census bans a clock in the engine's own directory.** `determinism-lint.mjs:59-63` censuses all of `.claude/lib/mitosis/` except `tests/` and `prompt-snapshots/`, and `BANNED_SURFACES` at `:37-45` bans `Date`. `cli.mjs` at the SPEC's path therefore cannot read a clock, yet J2 needs an instant and `run-store.openRun` already demands `startedAt`. The instant arrives as argv from the caller.
- **The test root is `.claude/lib/mitosis/tests/`.** The disposition record's `tests/...` citations are relative to `.claude/lib/mitosis/`, not the repository root.
- **Thirteen test files read `.claude/workflows/mitosis.js` directly; D2 names only five for deletion.** The survivors that C7 breaks or must re-point are C7's problem, not D2's.
- **`--json-schema` degradation is unconfirmed.** `dispatch.mjs:698-700` computes the payload as a nullable `structured_output`; whether `classify` refuses a schema request answered without one is unverified and must be read before C7 relies on it.

## 7. Verification

`receipts/gates@1.1` is the sole standard. Its rules override any older verification wording carried in this branch's own copy of `.claude/rules`, which predates the standard.

- Every fix ships an acceptance test red on the parent commit and green on its commit, asserting the reported symptom rather than a proxy, plus an inertness mutation observed directly.
- Exit codes are read from a redirected run, never from a pipe.
- The full suite and every gate verb the base runs green today must be green at the branch tip.
- Content presence on the base is asserted by file after any merge, never inferred from a MERGED status.
- A gate that cannot be cleared produces a tracked status - `fixed`, `unverified-reasoned`, `speculative`, `reverted` - never another review round and never a silent pass.
