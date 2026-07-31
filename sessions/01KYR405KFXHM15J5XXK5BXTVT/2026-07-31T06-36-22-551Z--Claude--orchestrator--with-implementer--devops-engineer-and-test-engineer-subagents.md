B-6 IMPLEMENTED, MERGED, AND GREEN ON MAIN. Track B is now complete; every unit (1), (2) and B-6 has landed.

SHIPPED. PR #19 "feat(gate): compile the workflow under the sandbox harness" merged as 95ef8e1. Both workflows are green on main at that SHA: `test` (which now carries the phase-parity gate step) and `security`. That closes the PR body's one open residual, "CI on this branch - not run at PR-open time" — the harness caller is now proven EXECUTING in CI, not merely wired.

Branch feat/gate-workflow-compile, cut fresh off origin/main at f908a74 per 14.8 (feat/workflow-sandbox-harness was spent and was NOT reused). Seven commits, 6 files, 1120 insertions / 57 deletions:
  a699086 test(gate): the sites === 0 characterization row §2.4 found untested — green on the UNREFACTORED gate, so a genuine characterization
  40c6188 refactor(gate): all three variable-built RegExps -> masked-source scans
  03e67fe test(lint): the counting-rule rewrite — RED ON PURPOSE, --no-verify, the M3 receipt
  3940f29 feat(gate): the sandbox-compile precondition — closes the receipt
  721b855 ci(test): one line appended to the test job; invariant-coverage byte-unchanged
  c074b47 test(invariants): the twelve-row coverage entry
  8076599 docs(mitosis): THE SPEC, NOW TRACKED

THE SPEC IS NO LONGER AT RISK. docs/superpowers/specs/2026-07-31-b6-harness-liveness-implementation.md was untracked and one session from being lost like the two other untracked specs. The spec's own §10 commit table omitted it — an oversight in the spec, corrected by shipping it as a seventh commit. Leak-checked (0 hits for the confidential codename) before tracking.

EVIDENCE, ALL EXECUTED AND READ (not reasoned):
  M3 red-on-parent: at 03e67fe, tests 3 / pass 2 / fail 1, the assertion naming workflow-sandbox.mjs :: compileWorkflow as the SOLE dead export — exactly what §5.4's rule-(d) census predicted. At 3940f29, 3/3/0.
  M3 inertness mutation 1(a): reverting the defining module to raw counting turned the masker row red at 3 !== 0.
  M3 inertness mutation 1(b), THE DECISIVE ONE: with raw counting restored AND the caller reverted to its pre-3940f29 state, the census passed VACUOUSLY despite compileWorkflow having zero callers — the two TypeError message strings credit themselves. That is the vacuity this change removes, demonstrated rather than argued.
  M3 inertness mutation 2: deleting .replace(ESM_EXPORT_PREFIX, '') turned the compile row red with the literal "workflow source failed to compile in the sandbox: Unexpected token 'export'".
  Full suite 1761/1761 (baseline 1756 + 5 new rows). Gate CLI exit 0 with its JSON verdict against the live mitosis.js. invariant-coverage-check ok, all twelve ids. semgrep p/default --error on mitosis-gate.mjs: exit 0, 0 findings, 0 nosemgrep — verified INDEPENDENTLY by the orchestrator, not taken from a subagent.

§2.2 AND §2.4 BOTH HELD ON CONTACT. The /^export /gm total strip was used, not the narrower /^export const meta/m. The sites === 0 fixture was written BEFORE the refactor touched that line, as 0145 required.

PROCESS NOTES WORTH KEEPING. Subagents self-disclosed two real deviations rather than papering over them: the implementer caught that `... | tail -20; echo "exit=$?"` reports tail's status not semgrep's, and captured semgrep's own code instead; the test-engineer found MITOSIS_PATH does not help tests/mitosis-gate.test.mjs (DEFAULT_PHASE_PARITY_TARGET resolves from import.meta.url with no override) and mirrored the real directory depth instead of faking a result. Both were reported unprompted. The orchestrator re-verified the refactor diff and re-ran semgrep itself rather than trusting the report.

HYGIENE HELD THROUGHOUT. Stash depth never moved off 2. Every commit staged explicit paths; never `git add -A`. The unrelated dirty paths stayed out of all seven commits. --no-verify was used on exactly one commit. workflow-sandbox.mjs is ABSENT from the change range, which is what makes B1-B5 not-threatened honest rather than asserted. .claude/workflows/mitosis.js was not touched by one byte, so the mirror-guard twinning tax stayed at zero. No worktree was created; the 12 leaked ones are untouched.

WHAT WAS NOT DONE. Track A remains deferred per 0136 and nothing in it moved. The six other paused mitosis threads still have no disposition. task_70509bf0 still could not be withdrawn.