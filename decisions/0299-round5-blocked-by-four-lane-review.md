---
Status: accepted
Date: 2026-08-09T02:41:52.122Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0299. Round 5 is BLOCKED, and two of its five blocking findings are regressions the round itself introduced

## Context

The fresh independent review ordered by this thread ran on 2026-08-08 as four parallel read-only lanes against the round-5 tree in .claude/worktrees/spec-a-cutover (uncommitted, branch at origin/main). Each lane was handed the ten known residuals up front so none of them spent the round rediscovering known ground, and each was fenced to a scratchpad probe directory with no write access to the worktree, the primary checkout or ~/.claude. The full suite was independently re-run by the orchestrator before dispatch: 2159 of 2159, exit 0, 71s, confirming the implementing round's claim rather than inheriting it.

Verdicts split two and two: adversarial BLOCK, correctness BLOCK, over-strength SHIP, test-quality SHIP. The split is not a disagreement. Every BLOCK finding lands in an area the SHIP lanes named explicitly in their own WHAT I DID NOT CHECK sections, which is what four disjoint lenses are for. Consolidated: 1 CRITICAL, 4 HIGH, 8 MEDIUM, 9 LOW.

The CRITICAL is a corroboration bypass. corroborated (cutover.mjs:288-289) demands disk evidence only for state in {link, real}; already-linked and absent records are carried and acted on with no corroboration at all, and firstByName (:291-292) makes carried records win by name. A journal planted once before any apply therefore survives a legitimate apply, turns rollback into an eleven-entry no-op that reports success with exit 0, and unlinks the journal, orphaning every aside including the two real directories hooks and rules that exist nowhere else. Reproduced by executed probe against a sandboxed config root.

The HIGH on the absent branch falsifies the contract's own concession. The contract states the absent branch's worst case is denial of service with no privilege gain. One planted or flipped state field makes rollback unlink ~/.claude/hooks, a real directory on this machine that wires both PreToolUse guards plus 24 other hook commands, then consumes the journal that named it. Measured gate asymmetry: rm -rf ~/.claude/hooks draws ask from the bash gate, the journal route produces the same deletion with no prompt.

Two further HIGHs are regressions this round introduced, both proved by running old code against new code in the same scenario. repoRootErrors was wired into readReceipt (receipt.mjs:96,112), so a relocated checkout now refuses cutover plan, cutover apply and promote rollback, verbs that never read the checkout; old code rolled back, new code errors with current stranded on the bad release. That is I7's own stated too-strong falsifier, implemented. Compensating for the same failing read, promote.mjs:492 falls back to process.cwd(), so once the recorded checkout is unresolvable, promote run from any other .claude-bearing repo builds a release from that repo, repoints current and rewrites settings.json at exit 0 with empty stderr; old code exited 1 and promoted nothing.

The fifth HIGH is independent: converge.mjs:72-87 never reads promotion.settings, so the unattended SessionStart/Stop hook rewrites ~/.claude/settings.json, measured as permissions.deny going from one entry to empty with statusLine deleted, and reports only the sha. settingsNotices is already exported at promote.mjs:499 and simply never imported.

One methodological result is worth as much as the findings. The test-quality lane proved every invariant by mutation, reintroducing each forbidden defect into a copy and confirming the suite goes red, and on that basis reported I3 HELD. The adversarial lane found that already-linked and absent records never reach corroborated at all. Both are correct. Mutation testing can only falsify code paths that exist, so a suite that is green and mutation-proven still missed a CRITICAL, because the tests and the mutations were both scoped to the branches the implementation takes.

## Options

- Consolidate the four lanes into a BLOCK and plan round 6 against amended invariants, treating the five blocking findings as symptoms of three property errors - ADOPTED
- Accept the two SHIP verdicts and ship, treating the two BLOCK lanes as over-strict - rejected, both BLOCK lanes backed every blocking finding with an executed probe and an old-code/new-code comparison, and the CRITICAL destroys the undo path for the entire global config while reporting success
- Dispatch a fix round directly against the consolidated finding list - rejected, this is the failure mode the thread has already paid for five times, and round 5 is itself the proof: implementing I7 as a finding-shaped patch introduced two new HIGHs on paths no finding named
- Take the adversarial lane's proposed remedy as written - rejected pending an independent permit-set check, because three prior remedies in this unit were wrong in the same way, round 3's too strong, round 4's reviewer proposal too strong, round 4's cheaper proposal too weak

## Outcome

BLOCKED. Round 5 does not commit, does not open a PR, and does not reach the 0281 rehearsal or the 0292 swap. Criterion c10 stays open at its fifth BLOCK.

The five blocking findings reduce to three property errors, and round 6 is planned against those rather than against the finding list.

First, corroboration is state-scoped where the contract states it universally. I3 says a journal record is inert unless corroborated on disk; the implementation applies that only to preserved states. The amendment must cover every record regardless of state, and must add the consumption rule the CRITICAL exposes: the journal may be consumed only when no aside it could have restored remains on disk. Both halves need a stated permit-set before anything is written.

Second, I7 was implemented at the read boundary instead of the use boundary. Validating repo_root inside readReceipt refuses verbs that never use the value, and the process.cwd() fallback exists only to paper over that refusal, which is how a single misplacement produced two HIGHs. The amended property is that a value is validated where it becomes a subprocess argument or a path, never where it is read, and that a failed read refuses rather than falling back to an implicit default. The same misplacement explains the over-strength lane's MEDIUM on gitEnvironment spreading ...inherited, where GIT_DIR and GIT_CONFIG_COUNT survive a hardening clause that enumerated two variables instead of stating a property.

Third, there is no invariant covering what the operator is told. converge dropping every settings notice, mergeJournal deleting carried records with no diagnostics channel, the partial-apply report omitting the one entry left moved-aside-only, and unwind writing an unrecovered flag nothing reads are four instances of one missing property: a state change the operator must act on is surfaced on the channel the operator is actually reading. The converge instance is a HIGH because the state change is the withdrawal of this machine's own permissions.deny enforcement.

Standing instruction carried into round 6: no remedy is implemented until the permit-set lens has attacked it. The over-strength lane has been resumed with the adversarial lane's proposed remedy and asked to determine whether it is sufficient or merely relocates the attack to names absent from plan.actions, and to adjudicate the candidate consumption property. That answer is a precondition for writing the amended contract, not a review of it.
