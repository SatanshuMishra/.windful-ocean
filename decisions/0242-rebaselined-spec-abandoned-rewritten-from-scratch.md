---
Status: accepted
Date: 2026-08-04T21:05:52.566Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0242. The re-baselined SPEC is abandoned and re-written from scratch against a fresh audit, not repaired further

## Context

Eight repair rounds ran against the re-baselined SPEC and its decision docket. Round 8 was an independent eight-verifier gate, one per invariant, none inheriting a prior verdict. Six verifiers returned before the user terminated the run: I2 HOLDS, I6 HOLDS, I3 VIOLATED 7, I5 VIOLATED 4, I7 VIOLATED 3, I8 VIOLATED 8 — 22 defects, with I1 and I4 closed carrying no verdict. Round 7 had closed 43 of 47 defects on its own accounting; an independent look found four invariants still red, found I7 worse than round 6 rather than better, and found round 7's own changelog asserting a claim that round 7 itself falsified (the errata note says 0197 appears nowhere in either document while round 7 added a substantive use at DOCKET:224). Two verifiers also reported material coverage gaps, so 22 is a floor. The documents had grown from 386 approved lines to 885 plus a 632-line docket, and the repair apparatus itself had become a defect surface: undefined marker vocabulary, self-refuting greps, a scope convention the contract never states.

## Options

- Run a round 9 repair against round 8's 22 defects, then a round 10 gate
- Re-run I1 and I4 to complete round 8 before deciding
- Abandon the re-baselined documents and re-write the SPEC from scratch from the approved original, against a fresh codebase audit
- Ship the SPEC as-is with its defects documented

## Outcome

ABANDON AND REWRITE, on the user's explicit instruction. The re-baselined SPEC and its docket are closed as unfixable; no round 9 runs and I1/I4 are not re-run, because completing the measurement would not change the disposition. The rewrite starts from the approved original (2026-07-30, 386 lines, sha256 0db8fe666b6ca3e8) and re-derives its content from an up-to-date audit of the codebase plus fresh research, rather than porting corrected text out of the re-baselined document. The rationale is that eight rounds failed to converge and the repair apparatus became its own defect surface: each round was authored against the previous round's finding list or against a document whose apparatus had already drifted, so corrections landed at one site and not its twin, and new claims entered under markers whose scope the contract never defined. The round 8 gate report is retained as evidence for the rewrite - it names exactly which claim classes decayed and why - but not as a work item. Superseding this decision would require evidence that the re-baselined documents can reach a clean gate, which eight rounds did not produce.
