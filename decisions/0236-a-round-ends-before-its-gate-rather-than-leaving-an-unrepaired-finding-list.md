---
Status: accepted
Date: 2026-08-04T16:00:37.573Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0236. A round ends before running its gate when the gate's repairs cannot land in the same session

## Context

Round 5 landed 91 edits and finished with context nearly exhausted. The I1-I8 gate had not been run against the resulting 844-line document. I2 and I6 had been run early, before the fold, with stated conditionality; I6 survived the fold (sections 1, 4 and 10.5 verified byte-unchanged) but I2 was voided by the 24 lines the corrections replaced, since I2 is exactly the invariant that asks whether removed content left a visible mark. Running the remaining seven verifiers was affordable; repairing whatever they reddened was not.

## Options

- Run all eight verifiers and hand off a finding list for round 6 to repair
- Run a cheap subset and declare the document gated on partial evidence
- Run no further verifiers, hand off at NOT READY with the unrun invariants named, and let round 6 open at the gate
- Declare READY on the strength of I6 holding and the applier's structural verification

## Outcome

END THE ROUND BEFORE THE GATE. 0230 already forbids the fourth option - structural verification is not the invariant set, and a green declared without the gate is precisely the false green 0230 exists to prevent. The second is worse than the third: a partial gate reported as a gate launders unrun invariants into implied passes.

The real choice was between the first and third, and it turns on 0230's central lesson - invariants govern what is checked, and a FINDING LIST IS THE WRONG ARTIFACT. Five earlier rounds each introduced a new defect on a path nobody had named, because each was scoped to the previous round's findings. A finding list handed to round 6 would recreate that shape, and it would age badly: the findings describe an 844-line document that round 6's own repairs immediately change, so early findings go stale against later fixes within the same round.

Handing off at NOT READY with the invariants NAMED AS UNRUN costs one gate run and buys round 6 a document whose state is honestly described. This extends 0231 from the edit set to the verify step: a verification whose repairs cannot land in the same session is not started either. The asymmetry that makes this safe is that an unrun gate is a known unknown, while a run-but-unrepaired gate is a list of known defects sitting in a document that presents itself as finished.

Round 6 opens by running I1-I8 in full against 844/615 lines. I6's verdict may be carried forward with its evidence; I2's may not.
