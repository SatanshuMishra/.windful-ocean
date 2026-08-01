---
Status: accepted
Date: 2026-08-01T18:51:40.772Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0189. A5 is the next MSP and narrows by measurement to three untwinned targets; progressPossible and the poll-cycle guard are excluded as already covered by the CI-enforced twin

## Context

0162 ruled A5 gets a characterization test and NO extraction, because M5 deletes the bounded poll by name. With 0188 discharging M5's other precondition, A5 is the only thing standing between HEAD and M5, making it the next MSP. Its nominal targets are readReviewDecision, resolveReviewEvent, mergePoll, progressPossible and the poll-cycle guard. Before writing a line, a read-only agent measured what the suite already asserts, and proved the gaps by MUTATION against scratch copies selected through MITOSIS_PATH rather than by reading for absence - the standing method rule, now seven instances deep. The test admission gate forbids duplicating existing coverage, so the measurement is what defines the scope.

## Options

- Write A5 against all five nominal targets as the mirror-gaps plan lists them
- Narrow to the targets measurement proves are genuinely unpinned, excluding what the twin already covers
- Skip A5 and let M5 delete the poll with no characterization
- Add the pins into the existing mitosis-scheduler and frontier-train-e2e files rather than a new file

## Outcome

NARROW BY MEASUREMENT. All citations origin/main at cad6ba2. EXCLUDED AS ALREADY COVERED: progressPossible (mitosis.js:2362) and the poll-cycle guard (:2397) both sit inside leases.mjs, which mirror-guard classifies WHOLE, so mitosis.js's copies are CI-proven byte-identical to the importable twin - and the twin is thoroughly pinned at leases.test.mjs:280-304 (four progressPossible cases), :328-359, :361-377 (budget exhaustion, polls.length 5), :397-403 and :424-430. Re-pinning them fails the admission gate. IN SCOPE, each PROVEN unpinned by mutation rather than inferred: resolveReviewEvent's CHANGES_REQUESTED branch (renaming the literal broke 0 of 271 tests); the exact MERGE_POLL_MAX_CYCLES 6 bound at mitosis.js:4989 (shrinking it to 1 broke 0 of 271); readReviewDecision's null-result fallback and its catch branch (executed incidentally by mitosis-scheduler.test.mjs:810-834, never asserted); resolveReviewEvent's other-string fallthrough and its decision-null guard; and MERGE_POLL_WAIT_SECONDS 300 / MERGE_POLL_INTERVAL_SECONDS 30 (:4990-4991) wiring into the mergeWatchPrompt call. Already covered and therefore NOT re-pinned: watch's fail-closed gates (frontier-train-e2e.test.mjs:1019-1037), onMerged's four mutations and the release-set recompute (mitosis-scheduler.test.mjs:741-782, :784-808), the sonnet model pin (:4386-4402), and the APPROVED happy path (frontier-train-e2e.test.mjs:459-486, confirmed load-bearing by mutation). THE SEAM, and the reason no smaller layer exists: mergePoll is a bare const at :5057-5095 with no export and no attachment to anything the caller receives; it is consumed only as the third positional argument to runSchedule at :5099-5108. Its sole observable surfaces are the agent() calls it dispatches (label prefixes merge-watch:, review-decision:, window-checkpoint:) and the final report plus log lines. So the test MUST use the full-workflow AsyncFunction harness with MITOSIS_PATH, copied from reconcile-only-advance-characterization.test.mjs:6,25-27 - the same pattern three files already use. TWIN RISK: readReviewDecision, resolveReviewEvent and mergePoll exist ONLY in mitosis.js and have NO twin, so A5 touches no mirrored file; the four closure variables mergePoll mutates are currentWindow (:4261, reassigned :5078), awaitingApproval (:4255, spliced :5088), shipped (:4253, pushed :5089) and blockedByApproval (:4257, deleted from :5092). FILE: one new .claude/lib/superpowers-parallel/tests/merge-poll-characterization.test.mjs, kept separate from the two large broad-purpose files so M5 can delete it alongside the production change.
