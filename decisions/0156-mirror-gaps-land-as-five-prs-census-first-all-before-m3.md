---
Status: accepted
Date: 2026-07-31T18:56:39.801Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0156. The two mirror gaps land as five PRs, census first, all before M3

## Context

The user folded two gaps into M2's scope mid-session, then clarified that they need NOT share M2's PR - multiple PRs are fine - but that all of it must land during or after M2 and BEFORE M3. Gap 1: 47.5% of mitosis.js (2,346 of 4,935 lines, 23 ranges) has no lib twin, so it is neither policed by the mirror guard nor reachable by a unit test through an import. Gap 2: mirror-guard.test.mjs:19 is a hand-typed 21-name array with no readdir and no completeness check - an OPEN census, which is exactly what registry invariant M2 forbids. The red check run against all 37 lib files proved Gap 2 is a LIVE defect, not future-proofing: msp-file-scope.mjs is a whole-file unpoliced twin duplicated at mitosis.js:67-78 (verified independently by the orchestrator, grep count 0 on the policed list), and the guard's whole-file granularity additionally hides three partial twins - pr-format.mjs, wave-planner.mjs and engine-args.mjs. A file-granular census would have passed while real duplication drifted. The orchestrator's initial hazard framing - that closing the census first would go red on in-flight extractions - was inverted by the data.

## Options

- One PR carrying M2 plus both gaps, as originally scoped
- Five PRs with the census closure landing FIRST, then M2, then three conditional extraction PRs
- Land the extractions first and close the census last, once the twin set has settled
- Land the census with the under-policed files on a declared exclusion list to get green quickly

## Outcome

Five PRs, in order: P1 test/mirror-census-closure (zero production change) - P2 MSP M2 including the mitosis.js:3779-3795 extraction - P3 forge + divergence facts - P4 reconcile-advance seam - P5 window + merge-poll - then MSP M3. The census lands FIRST and goes green on arrival with NO exclusion list, because all three under-policed cases classify truthfully into existing classes; every later extraction is then policed the moment it is created, and one that forgets its row fails in its OWN PR, which is the guard working rather than a hazard. The exclusion-list option is rejected outright: declaring a real twin standalone to obtain green is dishonest. P3 through P5 are explicitly CONDITIONAL - re-confirm the justifying milestone still names the region before opening each, because if M3 deletes runReconcileOnlyAdvance outright rather than absorbing it, P4 would extract code only to delete it.
