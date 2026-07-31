---
Status: accepted
Date: 2026-07-31T18:56:22.923Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0155. M2 ships no resumePoint change; spec 3.1's resumePoint sentence is wrong as written

## Context

Spec 3.1 asserts resumePoint stops being state and becomes derived per unit at relaunch, and the thread carried that into M2's scope. Execution refutes it in both directions. The load-bearing half is ALREADY fact-derived and always was: selectResumeBuilt SYNTHESIZES its descriptor at parking.mjs:124-128 from checkpointRef(runId, id) and never reads a carried resumePoint, so the built row of 3.1's table needs no resumePoint change at all. The other half is underivable in principle: no row of 3.1's four-row table yields stage plan-review or parallelize, and resuming at those stages requires the local plan artifact .mitosis/<id>.plan.md (mitosis.js:4396, guard at :4410), which is gitignored and machine-local by construction. A mid-stage resume point IS a local hint; deriving it from durable facts is impossible, not merely unchosen. Taken literally the sentence deletes mechanism 14 rather than deriving it and turns mitosis-scheduler.test.mjs:3922 and :3960 red. The one concrete defect section 9 named was already fixed by M0 at recovery.mjs:175.

## Options

- Implement the sentence literally in M2: stop carrying resumePoint and derive it per unit
- Ship no resumePoint change in M2 and record the spec sentence and 8 row 14 as amended
- Defer resumePoint derivation to a later MSP
- Rewrite the spec's resumePoint treatment as a standalone effort

## Outcome

M2 ships NO resumePoint change. Section 8 row 14 is amended to read: KEEP, derived where a fact exists (built to ship), carried as a local hint otherwise. Section 3.1's sentence "resumePoint stops being state" is recorded as WRONG AS WRITTEN. Deferring it to a later MSP is rejected because there is nothing to defer - half is already done and half is impossible. Rewriting the spec wholesale stays rejected per 0148; amend by execution, per MSP. This is the second spec amendment this session and the fourth spec defect overall, reinforcing 0152: treat every enumeration and every absolute claim in the quiescent-advance spec as UNVERIFIED until executed.
