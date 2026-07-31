---
Status: accepted
Date: 2026-07-31T19:22:46.557Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0160. H-A is the resurrection guard, not a hole; plan section 9's monotone-forward receipt is misworded and would assert a regression

## Context

Plan section 9 specifies a P2 receipt as: monotone-forward test, red on parent because the journal veto at mitosis.js:3787 lets parked plus resumePoint.stage equal to plan override a live checkpoint ref (hole H-A). Re-derivation at 1bb149d confirms the anchor exactly (shippedFoldedManifest at :3779-3782, the reconciledManifest reduce at :3783-3795, the veto at :3787) but inverts its meaning. That veto is the resurrection guard: a parked-at-plan record is written by the divergence-reset path at :3831-3847, and the veto is what stops a stale leftover checkpoint ref from flipping condemned content back to built. It is directly covered by the existing test H4 resurrection guard at frontier-train-e2e.test.mjs:578, whose assertion at :596 states that the unit is NEVER restored from its condemned durable checkpoint. A test written to be red-on-parent because that veto exists would therefore be asserting the exact safety regression 0155 already refused and that this thread's risk register already flags. Decision 0154 states the intended property precisely and does not conflict: monotone-forward WITH TWO NAMED VETOES.

## Options

- Implement plan section 9's monotone receipt as written, red-on-parent at the :3787 veto
- Reword the receipt: monotone-forward EXCEPT via two named logged vetoes, with the veto retained
- Drop the monotone receipt entirely and ship only the veto-is-named-and-logged receipt

## Outcome

Reword, do not implement as written. The veto at mitosis.js:3787 STAYS. MSP M2's job at that site is to make the veto explicit, named and logged, and to assert that parked and condemned are the only two vetoes, not to remove it. Plan section 9's monotone-forward row must be rewritten before P2 is implemented: the property under test is that a fact never regresses EXCEPT through one of the two named vetoes, so the red-on-parent condition is the ABSENCE of naming and logging, which is what the sibling veto-is-named-and-logged row already asserts, and not the presence of the veto. Implementing the row verbatim is a safety regression that frontier-train-e2e.test.mjs:578 would catch, so the cost of the error is a red suite rather than shipped breakage, but the plan text must be corrected so a later reader does not spend a cycle rediscovering this. Net effect on MSP M2 scope after 0159 and this record: H-C ships nothing, H-A ships naming and logging only, and H-B is the single uncontested behavioural gap remaining, itself narrower than the brief described since selectResumeBuilt at parking.mjs:111-132 takes no builtUnits parameter at all, making it an API-level omission rather than a skipped in-body check. P2 is materially smaller than the plan's estimated 115 production lines and must be re-scoped before dispatch.
