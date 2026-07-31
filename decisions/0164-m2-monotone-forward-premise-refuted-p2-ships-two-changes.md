---
Status: accepted
Date: 2026-07-31T21:38:27.834Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0164. M2's monotone-forward premise is refuted by execution; P2 ships two changes, not three

## Context

Decision 0154 ruled the M2 derivation monotone-forward with two named vetoes, and the re-scoped plan section 9 required a monotone-forward test red on the parent WITH the mitosis.js:3787 resurrection guard intact, per 0160. The dispatch carried an explicit escape hatch: if the only way to get a red test is by disturbing that veto, stop and report rather than ship a safety regression. The implementer invoked it.

## Options

- Ship a monotone comparator anyway, accepting a test that is green on the parent
- Generalise the parked veto so a monotone test can go red
- Report the premise refuted and ship P2 with the two changes that do have honest receipts

## Outcome

REFUTED, and P2 ships CHANGE 2 and CHANGE 3 only. Two exhaustive execution probes establish it: over all 128 input combinations of foldObservedStatus the measured ladder_lowerings is ZERO, and the condemned probe found 11 park events with zero done-or-shipped units condemned. The ONLY non-forward transition the fold can make is parked -> built for a unit whose resumePoint.stage is anything other than 'plan' - 7 of 128 combinations - and turning that red requires generalising the 3787-class veto, which 0160 forbids and which the implementer traced to a real regression: it would break the built-restore fast path. So there was no monotone hole to fix at this site. The implementer explicitly refused to ship an inert comparator, on the correct ground that a guard green on its parent proves nothing under registry M3 and would read as a delivered fix. Two limits are recorded rather than papered over. First, the regression argument is a TRACED code path across four gates, NOT an executed reproduction; a skeptical reviewer should demand that reproduction before reopening CHANGE 1. Second, the sweep is not exhaustive over mitosis.js - it covers foldObservedStatus and the planReconcile-driven condemned reset, but the Waves, Integrate and Ship phases were never swept for status assignments, and both the analysis agent and the implementer flagged that same gap. This is the fourth time in this thread that a confidently-held premise inverted under execution, after 0145, 0152 and 0159. The pattern is now the expectation, not the surprise.
