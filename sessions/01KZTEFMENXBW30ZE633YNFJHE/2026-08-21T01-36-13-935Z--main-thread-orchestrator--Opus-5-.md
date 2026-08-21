2026-08-20/21. Four defects found and shipped to trunk, the free lane made trustworthy, and the dependsOn design question answered. No billed lane ran; the spend cap still holds.

## Trunk moved a8c2cb23 -> 60e776fd

Four pull requests, all merged by the user, all content-verified on origin/main by git cat-file and grep rather than by a MERGED label:

- #261 a677b001 fix(mitosis): write journal genesis before Prep dispatches children. phase-driver.mjs gains writeGenesis in REQUIRED_PORTS and calls it as prepPhase's first action; cli.mjs wires the driver-level port. A run is visibly alive in seconds instead of after ~15 minutes of silent sequential planning.
- #262 e98c8c1c fix(mitosis): count declared units still parked in the ship status. ship-plan.mjs gains declaredUnitTotal; the denominator now comes from manifest.msps, not from the units that reached Ship. Red-on-parent reproduced the exact defect: actual 'all-integrated-opened', expected 'blocked'.
- #263 fb8c11ff feat(mitosis): order the merge on file overlap, not model dependsOn. New overlap-order.mjs derives edges from fileScope by reusing derive-edges.mjs's fileScopeOverlapAssertions (newly exported), consumed by integrate-plan topologicalOrder/gateBaseChain, ship-plan prerequisiteRecords, and divergence needKeyedParents. leases.mjs and parking.mjs receive ZERO changes by design.
- #265 60e776fd fix(mitosis): define dependsOn as semantic, not file overlap. prompt-plan.mjs now defines the term concretely and states that same-file units are already serialized, so declaring a dependency to protect against collision is harmful.

#264 was #265's first attempt, closed and superseded after the enforcer refused a fixture-only receipt.

## The dependsOn investigation (the session's main analytical result)

Three corrections to the inherited framing, each evidenced:

1. Nothing was "rejected" on the prior live run. add-truncate-to-strings had its plan APPROVED (invocation1.stdout:50-53, iterations 2). It died on two HTTP 429s (attempt-1/usage.jsonl:1,2), producing diagnose-dispatch-failed from unit-remediation.mjs:120.
2. add-pad-to-strings parked as blocked-by-parked-prerequisite (run.jsonl:3) WITHOUT ever being dispatched - after its 20,535-byte plan had already been written and paid for.
3. Removing the dependsOn edge does NOT create concurrent same-file editing. overlapHolder (leases.mjs:55-61) is checked in isDispatchable (:69) and isBuildable (:78), leases accumulate within a tick (:131,137), and engine.mjs:143-159 is a synchronous batch loop, so there is no cross-tick window either.

Also established: there is no machine rule producing dependsOn on the live path. prompt-plan.mjs:20 told the model to "express every cross-MSP dependency" and never defined the word; decompose-schema.mjs:46 accepts any id list; run-document.mjs:116-127 validates ids exist and derives nothing. derive-edges.mjs and wave-planner.mjs were NOT imported by cli.mjs at all - confirmed by the absence of edgeReasons, couplingEdges and any .graph.json in the run artifacts.

Two kill mechanisms existed, not one: the park record (parking.mjs:44-60, engine.mjs:266-276) is the report; isDispatchable (leases.mjs:67) is the cause. Suppressing only the record would have converted a recorded kill into a silent stall - that option was evaluated and rejected.

## Planning concurrency (question 2)

Line references corrected against the tree: unit-planning.mjs:301 is a closing brace, the loop is :352-359; engine.mjs:288-291 straddles two function boundaries, writeGenesis was :293; phase-driver.mjs:311-320 was correct.

The 8-minutes-per-unit figure in the prior spine is UNVERIFIED. Measured on the live run: truncate's plan took 244s, and the first journal byte arrived at +885s - 14m45s of total silence with only 2 of 4 units planning successfully.

Prep is incidentally sequential, not essentially: no prep step reads another unit's output; plan paths are keyed by unitId; the journal, run store and checkpoint refs are untouched during Prep; the lock is whole-run. The only real blockers are rate limits (the run died on 429s, and 4 concurrent plan children multiply that) and zero test coverage on planUnits. Precedent that concurrency is safe: pool.mjs:302-318 already runs up to 8 children concurrently in Execute.

## Harness repairs (m15 artifacts dir, outside the repo, no PR)

1. ENGINE_ROOT parameterized. full-e2e-lane-smoke.mjs:11 hardcoded an absolute path to the primary checkout, so a verification run from a composed worktree silently loaded main and returned a byte-identical baseline while exiting 0. full-e2e-lane-live.sh had the same defect (hardcoded REPO=); full-e2e-instrumented-runner.mjs did not (already took --engine-root). Now: ENGINE_ROOT env var, validated for existence and for containing .claude/lib/mitosis/cli.mjs, failing loudly with the tried path rather than falling back; the resolved root is emitted as an engine-root-resolved event and carried in the status file. RUNBOOK "Trigger with" updated.
2. writeGenesis wrapped for visibility. #261 added a driver-level port the harness's injection seam predated, so driverPorts fell through to the real unwrapped function - the earlier genesis happened but produced no harness event, defeating the reason #261 exists. Added to both full-e2e-instrumented-runner.mjs driverDeps and full-e2e-smoke-stubs.mjs, sharing wrapSimplePort. RUNBOOK "Continuous visibility" updated.
3. full-e2e-smoke-source-run-document.json created in m15 - a durable copy of the real decomposer-produced run document that was only in a reapable temp dir.

## Verification actually performed

- SMOKE on main@a8c2cb23: exit 0, 4/4 integrated and shipped, lockRefusalProved, resumeProved.
- SMOKE on the composed #261+#262+#263 worktree: exit 0, mergeOrder chained, six fileScope-overlap edges, genesis earlier.
- SMOKE on trunk 60e776fd (all four merges, first time as a set): exit 0. engineRoot proven to name the worktree in three places. mergeOrder is a four-unit chain truncate -> pad -> mean -> flatten, each based on the preceding integration branch. No unit parked, diverged or failed. write-genesis-start/exit at events lines 10-11, first dispatch at line 14. Unit suite 2300 tests, 2298 pass, 0 fail, 1 skip, 1 pre-existing todo in wave-planner.
- Composition check before merge: the three branches merged with zero textual conflict; #262 and #263 touch disjoint functions of ship-plan.mjs (produced/shipIntegrated vs prerequisiteRecords), proven by diffing each against origin/main and by ship-stack.test.mjs exercising shipIntegrated with both patches applied.

## Structural finding: parallelism is bounded by aggregation files

Every one of the four e2e units carries README.md and index.mjs in fileScope.edit. All four therefore overlap all four. The lease already serialized them BEFORE #263 - the smoke ticks are one unit per tick even though the model declared only one dependsOn. Consequence for the billed run: it will demonstrate a correctly-ORDERED pipeline, not a parallel one, and will open a FOUR-DEEP PR STACK rather than four independent PRs. This is correct under the user's own principle (four branches appending to the end of index.mjs from the same base would conflict), but the receipt must say so rather than implying throughput the run never had.

## receipts: all four PRs BLOCKed on G14, and the user merged over it

Diagnosed per PR from the downloaded receipt JSON (gh run download <id>; jq -r '.verdict, .reason, (.gates.G14|tojson)' <dir>/receipts-receipt/receipts_receipt.json). Every receipt was VALID (red true, green true); what failed was receipt STRENGTH. Durations 59s/100s/136s - real G14 runs, not the ~11s false-G11 signature nor the ~130ms ladder short-circuit.

Surviving mutants now on main, and what would kill each:

- cli.mjs:496 (=== -> !==). The carried receipt phase-driver.test.mjs never imports cli.mjs, so the line wiring the real writeGenesis is never executed. REAL GAP. Kill by extending .claude/lib/mitosis/tests/cli.test.mjs to assert the constructed driver ports call an injected writeGenesis when supplied and the real one when absent.
- ship-plan.mjs:552 (number -1). Kills the orderedLength===0 zero-guard; no test covers "Ship walked zero units while units were declared". REAL GAP. Kill by asserting the ordered.length===0 case in e2e-ship-pr.test.mjs, pinning the exact total.
- ship-plan.mjs:553 (number +1 and -1). EQUIVALENT MUTANTS, verified by running all three variants over every manifest shape and orderedLength 0-4. Not clearable by any test. Clearable by REMOVING the meaningless 0 literal: replace the `: 0` fallback with `: orderedLength` (Math.max(orderedLength, orderedLength) is identical), leaving no number to mutate.
- integrate-plan.mjs:296 (|| -> &&). `if (!settings.quiescent || settings.built.length === 0) return produced(...)`. The === mutant on the same line WAS killed, so the guard is partly exercised; nothing distinguishes the ||. REAL behavioral gap - assert the guard in both directions.
- divergence.mjs:29 (> -> >= and && -> ||). `m && typeof m.id === 'string' && m.id.length > 0`. No test supplies an empty-string id or a malformed entry. REAL gap.
- overlap-order.mjs:13 (x2) and :14 (=== -> !==). Inside describe(), composing a TypeError message. Message-only; killable by asserting the thrown message text.

G14 config here: mode block, max_mutants 12. On #263, 73 mutants were generated and 12 tried - selection is deterministic (files sorted, lines ascending, operators in table order) so a re-run tries the same twelve, but 61 remain unexamined.

CRITICAL for the next session: verify.js:983-984 emits BLOCK under mode block and NEVER scans the PR body, so the enforcer's own advice ("if a survivor is a genuine no-op, say so in the PR") is inert - an equivalent mutant is unclearable by wording. Combined with this repo's rule that a PR body is fixed at creation, the only remedies are a test that kills it or code that removes the mutable line. Caveat marked unverified: the enforcer source read was the local marketplace copy, not the pinned c6127ba55f9a5669a95614639b08f5d49c3f228b, though the BLOCK strings matched character-for-character.

Also note: a TEST-ONLY diff SHORT-CIRCUITS receipts (verify.js:496 excludes docs and tests from changedSource), so a pull request that only adds these tests returns PASS in seconds with G14 never refereeing anything. That PASS would be a short-circuit, not a cleared gate. The honest proof for a test-only change is a LOCAL mutation, quoted with the assertion text that fired.

## Incident: git stash is shared across worktrees

An implementer's inertness proof ran `git stash push -- <paths>` with a pathspec matching nothing (files already committed) - a silent no-op - followed by an unconditional `git stash pop`, which popped an unrelated entry belonging to the user's feat/layer4-observability branch, dragging a hook rename, config and rules files into its worktree with two conflicts. Fully reversed: the conflict-aborted pop RETAINED the entry, contaminated tracked files restored with git checkout HEAD, leaked untracked files deleted, stash list confirmed still at 4 entries. Nothing reached the commits or the diff. Saved as memory git-stash-is-shared-across-worktrees. Rule going forward: never use stash to compare against another commit; use `git show <sha>:<path>`.

## NEXT SESSION - the full plan to reach a green billed run

Step 0. Fast-forward the PRIMARY checkout. It sat at a8c2cb23, five commits behind, all session. ~/.claude rules, agents, skills and lib symlink into its working tree, so none of today's merged config is in force locally, and three gate verbs (dispatchable-agent-schema-capable, name-integrity, retirement-census) census that checkout rather than the commit under test. It carries pre-existing uncommitted changes (README.md, docs/*, .claude/sounds/OptionA.mp3, untracked .claude/README.md and scripts/README.md) that are the USER's and must not be reverted - fast-forward only, do not stash (see the incident above).

Step 1. Close the G14 gaps as ONE source-touching pull request, not a test-only one. Include the ship-plan.mjs:553 code simplification (removing the meaningless 0) in the same change so the diff carries source and receipts actually runs G14 over it. Prove EVERY mutant locally before pushing: apply the exact mutation named above, run the test, quote the assertion text that fired, revert, confirm green. Exit code alone does not prove a mutation was observable.

Step 2. Decide the glob over-serialization before the billed run only if the run's units use globs - they do NOT (all four e2e units name literal paths), so this is a follow-up, not a blocker. The rule as shipped treats any glob-bearing fileScope as overlapping everything, and prompt-plan.mjs actively encourages directory globs, so a real spec would over-serialize.

Step 3. At 2026-08-22 21:00 UTC, when the provider spend limit resets: run `--lane single` FIRST (one live unit, real dispatch, real PR, real CI), read its receipt, and only then `--lane full`. Never go straight to full. Before either, re-run `--lane smoke` against the then-current trunk - it costs nothing and its red is definitive.

Step 4. Expect the full lane to open a four-deep PR stack and to run fully serialized. Merge the stack parent-first, DELETE each parent branch and CONFIRM the ref is gone before merging its child, and assert content arrival with `git merge-base --is-ancestor <merged-head> origin/main` rather than trusting a MERGED label.

Step 5. Propose, do not legislate, the gates.G14.mode gap: under block with no per-survivor exemption and no post-creation body edit, a change carrying one genuine equivalent mutant can never go green. The standard's own default is warn for exactly this reason (GATES.md:518-520). File it against receipts/gates@1.1; never invent a project-local mandate.

## Filed, not fixed (all new items, none folded into shipped work)

- Double genesis write per invocation on engines carrying #261 (phase-driver prepPhase and engine.mjs Execute-start both call it). journal-store.test.mjs documents N identical genesis calls producing N lines as intended, and resume was empirically proved true with the duplicate, so foldJournal handles it. Left as accepted duplication.
- ship-plan's produced() carries no overlapEdges, so the derived ordering is observable only on the integrate side (integrateSummary.overlapEdges, wired at cli.mjs:544).
- Glob-bearing fileScope overlaps everything (see step 2).
- write_resume_instructions in full-e2e-lib.sh omits --lane and now also --engine-root from the resume command it prints.
- The RUNBOOK's illustrative event-log samples are stale; only the prose was updated.
- ship.status reporting nothing-pending when a unit parks during Integrate before Ship runs is the same class of ambiguity #262 fixed, mitigated only at run-verdict.mjs's exit-code layer. Changing it broke a deliberately-authored correct test (cli.test.mjs:285-295), so it was left alone.
- computeMergePolicyStatus's original defect (found by the investigator, fixed by #262) came from a read of Ship outcomes rather than declared units.