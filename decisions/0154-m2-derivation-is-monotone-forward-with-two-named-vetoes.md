---
Status: accepted
Date: 2026-07-31T18:56:14.730Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0154. M2's derivation is monotone-forward with parked and condemned as named journal vetoes

## Context

Spec 3.1 says status derives totally from facts: merged (forge) > PR open > checkpoint ref > planned, journal demoted to a hint. Implementing that LITERALLY is a safety regression. A checkpoint ref means a commit exists, not that its content is shippable: divergent invalidation condemns content while leaving the ref in place, so a total fact-assign resurrects condemned work, which frontier-train-e2e.test.mjs:578 exists to forbid. Neither parked nor condemned has any fact source in 3.1's four-row table, yet 8 row 13 keeps the park cascade. Separately, the merged fact is a BOUNDED read - gh pr list --limit 200 at mitosis.js:3718 - so absence from that list is not evidence of non-merge, and a truncated page could regress a merged unit. The derivation itself already exists at mitosis.js:3779-3795 with precedence enforced structurally at recovery.mjs:174, so M2 is closing holes in a live derivation, not building one.

## Options

- Total fact-assign exactly as spec 3.1 is written: every unit's status comes from facts, the journal contributes nothing
- Monotone-forward derivation: facts may only advance a unit along done > awaiting > built > planned, never regress it, with parked and condemned as two named, logged, journal-sourced vetoes
- Leave the derivation alone and patch only the two selector holes in place (approach C), deferring extraction to whichever later MSP makes condemnation durable
- Build a new total derivation table and migrate all ten folded-status readers (approach B, ~710 LOC)

## Outcome

Monotone-forward with two named vetoes, shipped as approach A: extract mitosis.js:3779-3795 into one named lib function so it becomes a policed twin AND unit-testable, make it monotone, and gate selectResumeBuilt on the builtUnits fact. Three commits in one PR - characterization test on today's output FIRST, then extraction, then behavior - which is how registry invariant M4 discharges in-PR by its own text, giving a defensible not-threatened rather than M1's repeated threatened. Approach B rejected: ~710 LOC, unreviewable, and it annexes the reconcile.mjs rows that 8 assigns to M3 and M7. Approach C rejected on Quality over Speed: it leaves the rescue reduce - the single most defect-prone site in the reconcile stage, where M0's bug landed - unpoliced by the mirror guard and unreachable by unit tests. The honest claim M2 may then make is that the journal is never the authority for done/awaiting/built - NOT the absolute spec 3.1 asserts - and the PR must say so plainly rather than overclaim.
