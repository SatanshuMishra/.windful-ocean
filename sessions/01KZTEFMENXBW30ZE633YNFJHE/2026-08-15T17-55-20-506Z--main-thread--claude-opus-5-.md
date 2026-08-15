Session pivoted from shipping MSPs to removing the reason MSPs had stopped shipping.

SHIPPED
- C5a as PR #111, merged. Tree-certified rebase, npm test 3205 true exit 0, seven verbs exit 0.
- PRs #112-#115 merged: the executable invariant apparatus removed across the base, C5b and C6. Net -9,462/+97 (-9,365). C6's boundary surface went 6,421 -> 3,737 lines. Three census verbs de-registered; base verb count 7 -> 4.
- PR #116 merged to main: receipts/gates@1.1 adopted as the global verification standard (.claude/rules/common/receipts.md plus the CLAUDE.md invariant), and receipts.config.json bound - claim.require_receipt_for any-source-change, the three ladder tags, G11 block, G14 block at twelve mutants, G17 threshold 3.
- PR #117 merged: recovered the stranded #113 content.

DIAGNOSIS
Fifteen of twenty-two MSPs had shipped and the rate was falling. Root cause is decision 0380, which declared SPEC acceptance lists a floor rather than a ceiling. A floor with no ceiling is an unsatisfiable acceptance criterion, so the work could not terminate as a matter of logic rather than discipline. Eleven method mandates then accreted, each promoted by an agent from one incident to universal scope without user sign-off, each adding unverified apparatus the next round had to verify. Measured against the receipts plugin, every one was a hand-rolled unbounded reimplementation of an existing bounded machine-run gate. The enforcer had been wired in this repo the entire time and never once asked for a receipt, because claim.require_receipt_for defaults to fix-claims and every MSP PR is a feature PR with no issue link. That vacuum is what the mandates grew into.

INVARIANTS RETIRED IN FOUR LAYERS
1. Handoff artifacts: 62 lines excised from ORCHESTRATOR-BRIEF.md, RULINGS-2026-08-14-C5-C6.md and STACK-STATE.md, each replaced with a pointer to the standard. A residue sweep then caught three live instructions the section-excision missed; prescriptive text was rewritten to the governing gate, while past-tense records in the SHIPPED files and DOCKET.md were deliberately left intact - rewriting those would falsify the record, and only instructions propagate.
2. Decisions: 0438 recorded, superseding 0380, 0386, 0393, 0394, 0428, 0430, 0435. Those seven then removed from the spine index, since records are write-once but superseded entries must leave the index or every briefing still reads them as governing.
3. Spine: all eleven Standing mandates and the mandate-flavoured watch-out items removed; eleven operational, legal and open-decision risks retained.
4. Code: the apparatus removed by PRs #112-#115 with test-removal rationale in every body per G11.

FAILED, AND WHY
PR #113 reported MERGED while its content never reached the base. It merged into chore/retire-apparatus-base after that branch had itself merged, and GitHub retargets a child only when the parent branch is deleted. Confirmed stranded by git merge-base --is-ancestor, then recovered by cherry-pick as #117 and re-confirmed by content rather than by status. This is the exact trap the merge-order guidance had named one turn earlier.

The global standard was also left as an unpushed local commit for several turns. Because ~/.claude/rules, CLAUDE.md and skills are symlinks into the primary checkout's working tree, it was in force only while that branch happened to be checked out; the recovery work had to run in a worktree for that reason. Both causes are now written into the rule so they bind future sessions.

Two self-inflicted errors: a substitution regex over-matched and ate a line out of the per-MSP loop, caught on read-back and repaired; and reconcile has failed all session with spawn git ENOENT, so branch bindings remain unreconciled.

NOT VERIFIED
The receipts enforcer has never run under the new config - no PR has been opened against it yet. gates.G13.coverage_command is deliberately unset because the correct invocation for this stack is unknown, and a mis-configured verifier verifies the wrong thing; unset means the gate does not run rather than a false all-clear.