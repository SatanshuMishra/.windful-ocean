Documentation session. No engine code was written, by intent: the goal was to clear every documentation and decision blocker so the next session can run waves 4 through 9 without stopping to deliberate.

WHAT SHIPPED

1. PR #237 resolved (dispatched implementer). The headline finding is that there were NO conflicts. GitHub reported CONFLICTING / DIRTY, but git's own ort strategy merged clean against every base tested. Cause: criss-cross merge bases - `merge-base --all` returned two, and a test file deleted on the branch but modified on main by the older base produced a modify/delete conflict that ort auto-resolves against a virtual base while GitHub's cached mergeability did not. Resolved by rebase, which also dropped a redundant merge commit already on main. Content preservation proven by patch-id equality across all four commits plus a net-diff comparison; deletion exposure derived by TREE comparison, finding zero silently-returned files and zero live importers of the deleted modules. Verification ran in isolated clones against a main baseline: identical failure sets both ways, so zero branch-introduced failures. Pushed with --force-with-lease. PR is now MERGEABLE / UNSTABLE, awaiting a human merge.

2. Five decisions recorded, 0615 through 0619 - the ceiling rule, the two-tier testing rule, the topology change, the four user rulings, and the test-cleanup follow-up.

3. New completion criterion c41: the test-suite cleanup, sequenced strictly after M16 is green and required.

4. whole-solution.md gained Part 8, which governs everything above it, and Part 6 was marked SUPERSEDED and retired as a scope surface. A .bak of the pre-amendment file sits beside it.

5. RUNBOOK.md gained the AMENDMENT 2026-08-19 (sections A-G) placed BEFORE the Standing Brief and overriding it. The "Base branch - check, never assume" rule was replaced, since it existed only to survive stacking. The unit status table was corrected against real PR state: M0, M12b-1, M2, M7, M12c, M3, M4 and M4b now read merged with their PR numbers; M12b-2 reads PR #237; M8a reads in flight rather than blocked.

6. The stale ws-m12b2 worktree was removed. It held refactor/mitosis-delete-run-engine at the pre-rebase head b46a155c, 5 ahead and 43 behind origin, and a push from it would have reverted the #237 fix. Verified clean first: zero porcelain lines, zero untracked or ignored files. The pre-rebase commits were NOT reachable from origin, so they were preserved at refs/backup/m12b2-pre-rebase rather than left to reflog expiry. The local branch now tracks origin at 9e856ddd. The repo's four stashes are global rather than worktree-scoped, belong to other threads, and were left untouched.

7. Three memories written (the ceiling rule, the green-suite finding, GitHub's stale CONFLICTING cache) and two updated to reflect the rulings.

WHAT FAILED OR WAS CORRECTED

The user rejected the framing of a question I raised from the design's own "open questions" section, and was right to: the design already specified the operator override, so asking whether to keep it handed a settled decision back as new work. That is the same mechanism that has cost this project three weeks. Recorded as 0615, and the whole open-questions section is now retired as a scope surface.

I also overstated the hand-off state earlier in the session, saying it was effectively done because I had refreshed the spine manually. The spine refresh is the substantive half but it is not the debrief: no session log existed until this entry, and no transition had been attempted.

CARRIED, NOT RESOLVED

#237's receipts BLOCK on G11 is pre-existing, fired identically before the rebase, and is the already-ruled tracked downgrade that M12b-3 also inherits. The remedy it names (a test-removal line in the body) cannot be applied because PR bodies are immutable after creation. Not a new decision.

The stop hook continued to name thread 01M0BV3M8GKVP5HSQKB19Z9WW8 (lead-share-bar-was-it-the-right-target) as active throughout. That is a different thread and a different session's pointer; parking this thread will not clear it.