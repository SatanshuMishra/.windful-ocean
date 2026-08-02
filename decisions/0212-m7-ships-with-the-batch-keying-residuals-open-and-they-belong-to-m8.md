---
Status: accepted
Date: 2026-08-02T22:38:54.549Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0212. M7 ships with the batch-keying residuals open, and they are assigned to M8 rather than a follow-up PR

## Context

Review of M7 produced 1 HIGH, 4 MEDIUM and 4 LOW. The HIGH (a deleted test that pinned surviving payload composition, leaving a fail-open mutation invisible to all 1836 tests) was remediated in round 1 as e662e20, verified by the fix agent applying the reviewer's mutation itself before agreeing and then proving the new assertion non-inert with three further mutations. Two MEDIUMs remain and they compound, both being consequences of the batching decision M7 made rather than defects in its execution: (a) a batch entry is bound to a target only by a parentId the agent echoes back, with nothing binding the entry to the endpoints it was told to diff - a mis-keying route to a false not-diverged that the per-parent dispatch at a618338 structurally could not have; (b) the two bare catches discard every diagnostic on the destructive path, so a whole-batch dispatch failure is indistinguishable in the logs from N genuine content divergences. Both are named in the PR body and in the coverage artifact rather than left silent.

## Options

- Remediate both inside M7 before shipping - neither is CRITICAL or HIGH and the branch was green, so this widens a merged-and-verified MSP after the fact
- Open a follow-up PR for the two MEDIUMs alone - a second review cycle for a diff smaller than the review that produced it
- Assign them to M8, which is the next MSP and already owns dispatch-result trust through its six escalation classes

## Outcome

Assigned to M8. Both residuals are about trusting an agent-returned batch answer, which is exactly the oracle-weakness M8's CI-to-green loop already has to reason about (spec section 12 item 2 names optimizing against a weak oracle as a falsifier). The named cheap fix for (a) is to add checkedBuiltSha and checkedMergedSha to the per-entry required list in DIVERGENCE_CHECK_SCHEMA, have the prompt echo the exact values diffed, and fold to diverged unless both match the target - no extra dispatch, two states preserved, every mismatch failing safe; it must land in both mirror halves. The fix for (b) is to pass log into the predicate's ctx and emit one line naming the whole-batch fold and its target count, restoring the operator signal deleted with the old outer catch, plus the e2e logLines assertion that went with it. Neither blocks the merge, and PR 36 merged as e9306e6 with both open and disclosed.
