THREAD OPENED, NO WORK DONE. This entry is the dispatch brief for the FIRST session. Nothing was implemented, nothing staged, no branch cut, no agent dispatched. The seeding session did read-only measurement only.

THE SPEC. docs/superpowers/specs/2026-07-30-mitosis-core-rebuild.md, "Mitosis core rebuild - step 6: fix pipeline, phase collapse, gate model". Status line reads "approved architecture, not implemented". Committed copy: branch docs/mitosis-core-rebuild-spec at d444797, NOT on main. Binding decisions 0115, 0117, 0118, 0119, 0120, 0121; governing 0106-0114 and 0116; all in the ledger under thread mitosis-architecture-rebuild-exploration (01KYR405KFXHM15J5XXK5BXTVT), which stays open for its own residuals and is NOT this thread's parent.

MEASURED STATE AT SEEDING (main, da0cefd, working tree clean but for the five known dirty paths):
- MSP-0 SHIPPED as PR #15 / 12053dc. Final review deleted, phase('Shepherd') renamed and declared as Resume, phase-parity gate live.
- MSP-1..MSP-13 NOT STARTED. mitosis-gate.mjs exists with no budget verb. MITOSIS_GIT_VERBS is still Object.freeze(['pr-create','pr-close','compare']) at mitosis-git.mjs:30, so none of the ten new verbs exists. Reconcile and Prepare still dispatch separately; there is no run-probe.
- Declared phase set is still the full 13, not the collapsed eight. 12 phase() call sites plus Resume assigned via opts.phase.
- Nothing staged anywhere: neither stash touches phases; no worktree carries a mitosis.js modification; every branch ahead of origin/main that differs on phases carries an OLDER set, never a collapsed one.
- mitosis.js is 5,514 lines. The SPEC's anchors were taken at 4,851 lines.

WHY THE SPEC STALLED. It did not fail. After MSP-0 the predecessor thread pivoted to the quiescent-advance spec (M0-M8, all delivered) and the boundary-preflight deletion. Step 6 has sat at MSP-0 since 2026-07-30. The defect it exists to fix is therefore still fully live: 8 sequential model round-trips before the first line of code, and the repo explored from scratch three times with the first two discarded (decision 0114).

PHASE A - UNDERSTAND AND VALIDATE. Read-only, dispatched in parallel, before anything else. No implementation may begin until A and B have returned and C has landed.
- A1 codebase-analyst: re-derive EVERY line anchor the SPEC cites, against mitosis.js at HEAD. Cover section 4's 14-row fate table, section 5's two findings, every anchor inside section 12's MSPs, and section 14's six do-not-regress rows. Return old anchor, new anchor or NOT FOUND, and what now sits at the old line. Anchors are presumed stale; a match is a finding, not an assumption.
- A2 codebase-analyst: audit section 2's preconditions by measurement, not by reading the table. Step 0 worktree reaper, step 1 sandbox test harness, step 1.5 streaming scheduler flip, step 2 twinning tax, step 3 durable state model + journal + journal-append verb, the soft depth constant, and the live human guard hook. Each present, absent or partial, with evidence.
- A3 codebase-analyst: per MSP-1..MSP-13, does its named target still exist; has any part already landed by another spec's work; does each deletion target still exist. Flag every MSP whose premise is now false.
- A4 researcher: has the harness contract the SPEC assumes changed since 2026-07-30 - agent() as the sole effector, opts.phase as the third parity surface, Workflow script capabilities, schema-forced structured output. Cite the current contract.
Give at least the highest-impact A findings an adversarial verifier prompted to REFUTE before they are treated as settled.

PHASE B - CHOOSE THE REMEDY. After A returns.
- solution-architect per material gap: 2-3 options against trade-offs, one recommendation, grounded in the current code.
- Where a gap touches gate trust, fail-closed halting or the effector boundary, add a second lens rather than a second correctness reviewer.

PHASE C - MAKE THE CHANGES. Re-baseline the SPEC document itself: correct every stale anchor, amend any MSP whose premise A3 refuted, and record a decision per material change rather than silently editing. Decide and record whether the SPEC lands on main. Commit before dispatching implementation.

PHASE D - IMPLEMENT. One DEDICATED small dynamic Workflow, not ad-hoc subagent dispatch. Ordering is bottom-up and MSP-1 MUST precede MSP-2, or the before-and-after replay 0115 owes is unpayable forever. Stacked PRs are permitted to keep working through a blocking PR. Test MSP-12's falsifier EARLY rather than at the capstone: if a stage needs a closure over run state, pipeline-as-data is refuted and the fix pipeline stays imperative. Expect the human write-approval hook to serialize every write under .claude/{hooks,rules,lib,workflows}; design the workflow around interactive approval instead of unattended fan-out.

USER DIRECTIVES CARRIED VERBATIM. No debrief was run on the seeding conversation. The predecessor thread will be restarted separately to continue its own remaining work. This thread's primary focus and completion criteria are the step-6 SPEC and nothing else; other specs are excluded unless a precondition genuinely depends on one.