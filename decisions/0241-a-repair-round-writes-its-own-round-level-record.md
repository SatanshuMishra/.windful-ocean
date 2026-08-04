---
Status: accepted
Date: 2026-08-04T19:41:02.751Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0241. A repair round writes its own round-level changelog, and no patch may defer it to another agent

## Context

Rounds 2, 3, 4 and 5 each have a round-level entry in the documents' repair history. Round 7 nearly shipped without one. Its individual edits all carried inline [RB] marks, so nothing was silent and I2's discipline held - but four separate patches each deferred the ROUND-level record to "the applier or K10", and K10's own brief scoped it to backfilling rounds 4 and 5. Every author reasonably assumed another would write it. The applier then correctly declined, on the ground that composing a round's self-description is authoring new content and would mean deciding what round 7 claims about itself, including whether the four held edits counted as landed. The gap was real: 122 applied edits with no record a fresh session could read. This is diffuse responsibility, not any author's lapse, and it is a property of parallel authoring that will recur in round 8's fold.

## Options

- Leave the round-level record to whichever patch happens to claim it
- Assign it explicitly to a closeout agent that runs after the fold, with the fold's measured results in hand
- Have the applier write it as part of applying
- Skip round-level records entirely and rely on inline markers

## Outcome

A DEDICATED CLOSEOUT AGENT OWNS IT, AFTER THE FOLD. The round-level changelog is written once the fold's numbers are known, by an agent whose brief names it as the deliverable - never by a reasoner (which cannot know what actually landed) and never by the applier (whose authority is fidelity to what was authored, per 0240).

Round 7's entry landed in the SPEC preface repair history and DOCKET Section E, and its required content is the template: no exhaustivity claim, because SPEC:17's "No exhaustivity claim replaces it" is the correct register and round 2's opposite claim had to be withdrawn; an explicit statement that the round carries NO verdict and that a gate is required before READY; the method used; the true numbers including what was held and why; what the round found that the gate did not; and the count of questions still reserved to the user, with its derivation shown so the count is checkable.

Skipping round-level records is rejected: inline markers tell a reader what a line now says, never what a round did or chose to leave alone, and a fresh session cannot reconstruct the second from the first. Leaving it to whichever patch claims it is the failure just observed. Having the applier write it collides with 0240's separation of fidelity from authorship.
