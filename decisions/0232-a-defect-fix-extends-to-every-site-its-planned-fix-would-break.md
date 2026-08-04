---
Status: accepted
Date: 2026-08-04T14:54:05.554Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0232. A defect fix extends beyond its planned site list to every site the planned fix would otherwise break

## Context

ROUND-4-PLAN.md enumerated 14 edit sites for the 8 residual defects. Applying exactly those 14 would have left four fresh internal-consistency (I5) violations. Defect 6 replaced a grep that does not establish its conclusion, but the plan listed only the two SPEC sites while the docket's D-08 carried the identical flawed evidence. Defect 4 reclassified D-02 from OPEN to PARTIALLY CLOSED, and the docket's BLUF settled table, its arithmetic sentence, its consequence table, its round-3 changelog table and both SPEC arithmetic sites each assert a count that the reclassification falsifies. A plan's site list is derived from a read of the documents at one moment; it is evidence about where a defect appears, never a guarantee of where its fix propagates.

## Options

- Apply exactly the 14 planned sites and file the consequences as new defects for a round 5
- Apply the 14 and leave the consequences unrecorded
- Extend the pass to every site the planned fix falsifies, in the same set
- Stop and re-plan once the first extra site is found

## Outcome

EXTEND THE PASS, in the same set, and report the count applied against the count planned. 21 sites were applied against 14 planned. The reasoning is the same one that makes a matched pair all-or-nothing under 0231: a fix that removes a false claim from one document while leaving the identical false claim in the other converts a decision-closure defect into an internal-consistency defect. It does not reduce the defect count, it relocates it, and it relocates it into the invariant (I5) that is hardest to detect by reading either document alone. Filing them for a round 5 was rejected for the same reason: the window between the two rounds is a window in which the documents contradict each other. The obligation this creates on the pass is disclosure, not silence: the count applied is reported against the count planned, with each extra site attributed to the planned fix that forced it, so a reviewer can audit the expansion rather than discover it. Bound: this authorizes extending a fix to sites the fix itself falsifies. It does NOT authorize fixing unrelated defects noticed in passing -- those are filed, not folded in.
