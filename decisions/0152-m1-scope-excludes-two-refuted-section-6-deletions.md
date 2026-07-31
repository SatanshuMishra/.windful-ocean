---
Status: accepted
Date: 2026-07-31T18:11:33.951Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0152. M1 ships section 10's row, not section 6's prose: two deletion claims are false

## Context

Spec section 6 describes M1's end state and lists markAwaitingMerge and progressPossible as free deletions - markAwaitingMerge as having zero consumers, and section 11 as progressPossible having zero test references. Section 10's landing table instead assigns progressPossible's deletion to M5 and the loops calling markAwaitingMerge to M3/M5. Execution refuted both claims: markAwaitingMerge has four call sites (leases.mjs:204, :278, mitosis.js:2124, :2198) and roughly fourteen disposition assertions in leases.test.mjs, and progressPossible is imported at leases.test.mjs:16 and asserted at :284, :290, :297, :303. Landing either deletion in M1 would break the branch on tests M3/M5 own, violating the green-branch invariant that makes an MSP independently shippable.

## Options

- Implement section 6's prose in full, deleting markAwaitingMerge and progressPossible in M1 and rewriting the build-ahead and bounded-poll tests that M3/M5 own
- Implement section 10's M1 row only - terminal-status rewrite, blockedByApproval prune, report-only resumePoint - and leave both deletions to the MSPs the table assigns them to
- Halt M1 and re-baseline the whole spec against main before implementing anything

## Outcome

Option 2. M1 = section 10's row. Section 6 is read as describing the target END STATE across several MSPs, not as M1's changeset; where section 6 and section 10's table disagree, the TABLE governs, because it is the one that encodes the green-branch dependency order. Rewriting spec anchors wholesale stays rejected per 0148; the correction is per-MSP re-derivation by execution. Generalization for every remaining MSP: treat EVERY enumeration and every zero-consumer / zero-reference claim in the quiescent-advance spec as UNVERIFIED until executed - four such claims have now been refuted across 0137, 0144, 0145, 0151 and this record.
