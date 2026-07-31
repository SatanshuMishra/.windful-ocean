SHIPPED: Track B units (1) and (2) of the brief, both merged. main advanced 1253052 -> 14835ba -> f908a74.

PR #17 (feat/invariant-coverage-gate -> main, merged 01:29Z). Merge commit 747865f folded origin/main in so the head carried both the gate workflow and its own coverage entry (0138). Commit 2d7135e rewrote all 12 registry source values from the bare filename to docs/superpowers/specs/2026-07-30-two-track-invariant-plan.md and updated the M5 row's check to match. All 11 checks green. Work done in a throwaway worktree at .claude/worktrees/invariant-coverage-gate, removed after push, so the leak count did not grow.

PR #18 (feat/workflow-sandbox-harness -> main, merged). Merge commit c82dc48 brought main in. f4eaf91 added docs/invariants/coverage/feat-workflow-sandbox-harness.json with 12 rows: B1-B5 threatened with each check naming its test corpus, B6 not-threatened and explicitly NOT discharged, M1/M4/M6 not-threatened, M2/M3/M5 threatened. 5b67ffd strengthened the M3 row with a CI receipt. All 11 checks green. Worked in the primary tree; all seven dirty paths and both stashes verified untouched afterwards.

FIVE RISKS RETIRED BY EVIDENCE, not argument:
1. fetch-depth 0 / origin/<base-ref> resolution - PROVEN. The invariant-coverage job on PR #17 (run 30595807100) printed "mode: pull request against main". Since the checker fails closed on a pull_request event whose base ref will not resolve, a green result on that event is itself proof it did not degrade to push mode.
2. First pull_request exercise of the gate - done, green, twice (#17 and #18).
3. The sast red - MECHANISM FOUND, no adjudication needed. security.yml takes its semgrep baseline from github.event.before on push, which is all-zeros on a branch's FIRST push, so the scan runs full and surfaces the 3 sg.run/gr65 findings pre-existing on main (lines 262, 275, 455). Every later push and every pull_request event (baseline = pull_request.base.sha) scans diff-aware and is green. Predicted before the push and confirmed after.
4. "NO CI RUN EXISTS for any branch" - false again, as 0141 already found. Runs existed for both branches.
5. The B6 verdict-domain concern I raised - WITHDRAWN. See 0142.

FAILED / CORRECTED IN FLIGHT:
- I recommended adding a third verdict value to the coverage schema, reasoning from the schema instead of the source of truth. Reading the tracked spec reversed it: line 121 fixes the two-value domain and lines 196/207 show B6 marked not-threatened all through the sandbox work. The central lesson recurring in a new costume, this time on me. Recorded as 0142.
- The sandbox entry's first M3 draft said the 2f4ee4d red was "asserted only from the commit's own report". It was not: CI run 30591117430 records the B1 host-reachability and B5 identifier censuses FAILING at parent 3e59d05, and run 30593758261 records success at 2f4ee4d. The authoring agent could not see that evidence; the orchestrator had it from an earlier read. Corrected in 5b67ffd. This is a concrete instance of why M1 verdict truthfulness is a human gate (spec line 124).

CHECKS THAT COULD HAVE GONE THE OTHER WAY:
- M2 forbids a pinned count as a change-detector in any identifier-classifying gate. The four sandbox test files were grepped: no count === N anywhere. Every numeric assertion is a length > 0 non-vacuity guard, one empty-list check, or an offset-preservation property on the literal masker; totality is enforced by deepEqual against derived universes.
- B6: grep for compileWorkflow across the tree returns only workflow-sandbox.mjs, its four tests and the plan document. .claude/workflows/mitosis.js does not import it. Zero production callers, confirmed, and recorded as such.

ALSO: posted a comment on PR #17 recording the discharged Not-verified line, since pr-create composes the body and post-creation body edits are denied. Comments are NOT on the deny list; only gh pr create, gh pr merge and gh pr review are.

NOT DONE: unit (3), B-6. Unblocked now that workflow-sandbox.mjs is on main, but not started - context budget, and it is the heaviest remaining unit.

No background tasks or subagents left running.