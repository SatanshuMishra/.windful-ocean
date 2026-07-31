---
Status: accepted
Date: 2026-07-31T20:27:10.206Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0161. M3's shepherd path has ONE referent, not two, and M3 deletes it

## Context

Plan section 4.3 named an ambiguity carried forward as a standing thread risk: M3's "shepherd path" was believed to have TWO referents, the leases.mjs poll shepherd (a mirrored twin) and runReconcileOnlyAdvance in mitosis.js, whose log strings name a "reconcile-only shepherd". Section 11 made PR P4 conditional on settling it: absorb means the A3 extraction is worthwhile, delete means it is pure waste. A read-only workflow settled it against pinned extracts of commit 7b8acd2, never the working tree, because a concurrent workflow was rewriting mitosis.js at the time.

## Options

- Absorb - M3 unifies the advance loops and runReconcileOnlyAdvance's body survives under a new home, so extracting it into reconcile-advance.mjs first buys a policed seam
- Delete - M3 removes the function and its gate as code entities, so extracting first is extract-to-delete
- Undetermined - the spec does not resolve at implementation granularity, so P4 stays parked

## Outcome

DELETE, at high confidence, and the two-referent framing is REFUTED. leases.mjs was grepped in full at the pin: 292 lines, ZERO occurrences of "shepherd", and it defines neither runReconcileOnlyAdvance nor shouldReconcileOnly under any name. Its whole-mirrored functions are separately and distinctly named by the spec as the tick scheduler and the streaming duplicate. There is one referent: runReconcileOnlyAdvance, measured at mitosis.js:2977-3120 in the pinned extract, 144 lines, matching the plan's claim exactly. The spec's own first use of the word binds it to that function. Three independent spec statements use the verb DELETE for the function plus its four-part gate shouldReconcileOnly (pinned mitosis.js:2748-2750): the "Deleted:" summary line, the mechanism-ledger row, and the M3 landing-plan row itself. The softer "fold it in" phrasing describes where the shepherd's functional INTENT goes - realized through the pre-existing, separately KEPT planReconcile mechanism - not preservation of runReconcileOnlyAdvance's implementation. How the wrong framing arose is traceable and worth keeping: M3 deletes the streaming duplicate AND the shepherd in one sentence, and the streaming duplicate genuinely does live in leases.mjs as a whole twin. Consequence: per section 11's own pre-committed answer, P4's A3 extraction is dropped and replaced by a characterization test with no extraction, so M3's deletion becomes verifiable against a unit test rather than an e2e. Open and NOT closed by this record: the spec speaks at mechanism-disposition granularity, not implementation-line granularity, so whether M3's new unified loop reuses fragments of the old body under a different name is unestablished.
