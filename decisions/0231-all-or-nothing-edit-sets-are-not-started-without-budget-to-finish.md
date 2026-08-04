---
Status: accepted
Date: 2026-08-04T14:39:15.668Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0231. A repair whose edits must land in two documents at once is not started unless the session can finish it

## Context

The 8 residual defects split into two kinds. Four of them (the missing 0130 rulings, the missing 0210 green test, the mislabelled-verbatim 0128 quotation, and the elided gate-output path) each require a matched edit in BOTH the re-baselined SPEC and the decision docket, because the two documents assert the same fact in two places and invariant I5 is exactly the agreement between them. The read phase - handoff, both missing decision records in full, the whole 789-line SPEC, the band enumeration - consumed the session's context, leaving enough room to begin the edits but not to complete them or to re-verify I1-I8 afterwards. Starting anyway would have applied one half of each matched pair. 0230 already fixes the round-level rule (stop at NOT READY rather than declare a false green); what was undecided was whether that rule reaches an individual edit set inside a round.

## Options

- Apply what fits and leave the rest for round 4 - visible progress, but every half-applied pair converts an I4 defect into an I5 defect, and I5 was already violated
- Apply only the defects that touch one document (3, 6) and defer the four paired ones - safe on I5, but leaves the two defects the briefing named as chiefly the point of the round untouched
- Apply nothing, and spend the remaining context writing the round-4 plan so the next session starts at the first edit rather than at the first read

## Outcome

Option 3. No edit was applied and ROUND-4-PLAN.md was written instead, carrying the enumerated band, both decision records read in full, and a 14-site edit list with file and line per defect. The general rule adopted: an edit set whose correctness is a property of two documents agreeing is atomic for planning purposes - it is not begun unless the session can also finish it and re-run the invariant gate. This extends 0230 from the round to the edit set. The cost is a session that shipped no document change; the benefit is that the pair's disagreement count did not grow, and round 4 opens at the first write rather than repeating a read phase that has now been paid for twice. Measured consequence for round 4: it inherits a plan, not a finding list - which is the form the earlier five-round failure showed was necessary.
