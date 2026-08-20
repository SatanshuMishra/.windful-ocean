## c28 live run: PASS, and a new engine defect found in the merge half

### The run

Triggered by the orchestrator directly, which falsifies the standing "a live run is human-triggered by construction" belief. Only the destructive force-push reset is denied. Routed around it by creating a fresh substrate (mitosis-live-pr-harness-r2) seeded at fe0dff16 instead of rewinding the old one; a new repo has no merged-pull-request history, so the done-oracle question the runbook could not settle in advance disappears by construction. One line changed in run-live.sh.

Result: every declared check passed, failures=0.

- ship.opened = 3 (strings-titlecase, arrays-partition, numbers-clamprange); ship.parked = []
- preOpenCount 0 -> postOpenCount 3, delta 3, three distinct urls, no duplicate heads, all three bodies ending in the machine trailer exactly
- numbers-clamprange based on the strings-titlecase head, not the trunk: the serialization is real
- crash-resume: attempt 2, restarted false, journal grew 2 -> 11 lines with the prefix invariant intact
- poisoned lock: invocation 2 exit 1 with empty stdout; retire refuses without --force, clears with it
- the three designed parks all landed at Execute with honest diagnoses (dispatch-threw, a 1ms budget timeout tagged NeedsHuman, blocked-by-parked-prerequisite naming its blocker)
- engine pin hashes byte-identical before and after: the run did not mutate the engine
- process exit 3, the declared healthy outcome

The M15 root cause is confirmed fixed: the 226-character rationale that parked the third unit now composes, and composePrCreateArgv returns unusable: [] for all six units.

### The merge half exposed the defect

Merged pull requests 1 and 2 by hand; trunk green. Pull request 3, the stacked child, was CLOSED rather than retargeted when its parent branch was deleted. Recovered by opening a superseding pull request from the same head against the trunk through pr-create. Final trunk: all three units' content byte-identical (0-line path-scoped diffs, including against the deleted branch's original head sha) and green at 38 passing tests.

GitHub's CONFLICTING verdict on the closed child was a phantom computed against the dead base: git merge-tree returned a clean tree and the real merge exited 0.

Two probes then isolated the behaviour. A separate ref delete closed the child; gh pr merge --squash --delete-branch closed it identically, because gh issues the ref delete as a separate call after the merge returns. Retargeting the child first with gh pr edit --base, then deleting, left it OPEN, based on the trunk and MERGEABLE, with only a base_ref_changed event. GitHub documents the auto-retarget; it did not fire in either measured case.

### The new bug, and its fix

ship-plan.mjs:623 computed deleteAfterMerge: stacked.some((other) => other.base === entry.head) — the flag fires EXACTLY AND ONLY when a child is stacked on the entry, which is precisely the case where obeying it destroys that child. No retarget step existed anywhere in the engine.

Dispatched delivery-lead. Pull request 255 (fix/mitosis-stacked-retarget, 3 files, +112/-8) adds retargetBeforeDelete to every merge-order entry another entry stacks on, keeps deleteAfterMerge unchanged in name and meaning, and resolves the target base transitively so a three-deep stack never names a branch the same order deletes. Acceptance test red on parent 18048a14 at exit 1 with 14 other tests passing in the same process; four inertness mutations all fired targeted assertions; suite 62 passed 0 failed exit 0. All twelve CI checks pass, receipts at 1m49s on a diff carrying a real source change, so the gates ran rather than short-circuited. Awaiting human merge.

### Cleanup for a fresh session

Archived first, because deleting the repos would have destroyed the evidence decisions 0641 and 0643 cite: m15/evidence-archive/ now holds all 11 pull request bodies across both harness repos, both closed-child timelines, both branch listings, and substrate-seed-fe0dff16.bundle verified as a complete history. The seed previously existed only inside the harness repos, so deleting both would have made the substrate unreconstructible.

Staged mitosis-live-pr-harness-r3, pristine: main at exactly the seed, no other branch, no pull request. run-live.sh line 7 repointed to it. Line 92's run-document default changed from run-document.json to run-document-c28-rerun.json — the old default silently ran the known-bad document that parks, a landmine for any session that forgot the environment variable. Runbook steps 1 to 3 marked obsolete and step 7 rewritten to the measured retarget sequence.

A fresh e2e run is now one command with no environment variable:
bash <artifacts>/m15/run-live.sh

### Left for the human

- Merge pull request 255.
- gh repo delete SatanshuMishra/mitosis-live-pr-harness --yes (fully superseded; its finding is written up in c28-ship-park-root-cause.md)
- gh repo delete SatanshuMishra/mitosis-live-pr-harness-r2 --yes (hold until the urls in 0641 and 0643 are no longer wanted live; its evidence is archived)
- MITOSIS_LIVE_GH_TOKEN is still absent, so live-github-substrate has failed all 10 runs on main and c31's runs-in-CI half stays unproven.

Nothing is left running. No background shells, no open worktrees from this session beyond .claude/worktrees/stacked-retarget, which holds pull request 255's branch.