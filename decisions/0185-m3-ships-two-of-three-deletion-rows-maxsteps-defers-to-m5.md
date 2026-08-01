---
Status: accepted
Date: 2026-08-01T08:23:41.514Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0185. M3 ships two of its three mechanism-ledger deletion rows; maxSteps defers to M5 because the step bound is load-bearing until the quiescent exit exists

## Context

Spec section 10's M3 row names four deletions: the streaming path, the shepherd path, its gate, and maxSteps (mechanism-ledger rows 2, 3, 11). Section 3.2 justifies deleting maxSteps with the claim that the loop cannot spin because every iteration either performs an action or exits. The dispatched workflow was instructed to test that claim against the CURRENT tick loop rather than the spec's target loop, on the ground that the property may belong only to the target shape - in which case removing the step budget before the rest of the change is a hang risk. The implementation contract initially specified the maxSteps deletion in both twins; it was dropped during execution and declared rather than shipped quietly.

## Options

- Delete maxSteps in M3 as section 10 specifies, accepting an unbounded tick loop until M5 lands the quiescent exit
- Ship M3 without the maxSteps deletion and move mechanism-ledger row 2 to M5, declaring the omission in the PR
- Hold M3 entirely until M5's quiescent exit can land in the same change

## Outcome

SHIP TWO OF THREE, ROW 2 MOVES TO M5. Verified first-hand at fec38ac: runScheduleStreaming, dispatchableStreaming, STREAMING_DISPATCH_ENABLED, shouldReconcileOnly, hasBuildableWork and runReconcileOnlyAdvance are at ZERO occurrences across mitosis.js, leases.mjs and reconcile.mjs; maxSteps SURVIVES in both twins (leases.mjs:170/172, mitosis.js:2382/2384). The step bound is the only thing bounding the tick loop until M5 replaces it with the quiescent exit, so deleting it in M3 would trade a bounded wrong stop for an unbounded hang - a Quality-pillar regression taken for spec tidiness. The omission is carried honestly in PR 30's Not-verified block, not buried. CONSEQUENCE for the spec: section 10's M3 row is now inaccurate as written and section 8 row 2 belongs to M5; M5's scope grows by one deletion. Do not mark M3 fully delivered against section 10 without this correction.
