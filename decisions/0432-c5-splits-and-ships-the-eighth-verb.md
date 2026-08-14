---
Status: accepted
Date: 2026-08-14T23:59:05.495Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0432. C5 splits and ships the eighth verb; C6 takes no verb and skills byte-cleanliness holds to D1

## Context

Three carried questions blocked cutting the C5 and C6 lanes. The SPEC sections were read directly rather than inferred. C5's Files list is the engine Parallelize path only (SPEC:486) with fixture-based acceptance (SPEC:496); C6's are boundary-gate.mjs and tests (SPEC:504) with five behavioral cases (SPEC:510); C5 is told to AUDIT plan-to-task-graph/SKILL.md and record the audit in the PR body (SPEC:494), while the skills WRITE is designed into D1 (SPEC:536). The SPEC is explicit whenever it wants a verb - A4 names all three, names the three registration points, and gives each a red case (SPEC:358, :366) - so the silence in C5 and C6 is a signal, not an omission.

## Options

- Follow the SPEC on all three: no eighth verb, no CI matrix extension, skills byte-cleanliness held to D1
- Follow the SPEC on C6 and skills but override it on C5, shipping the coupling-parity verb as a split C5b
- Add verbs in both C5 and C6 for consistency with every MSP from C1 through C4c

## Outcome

Option 2, ruled by the user. C6 takes no verb and skills byte-cleanliness holds to D1, both per the SPEC. C5 is overridden and SPLITS: C5a is producer enforcement (~380 LOC, deriveEdges adds a real edge for every serialize resolution through the same addEdge path the fileScope-overlap rule uses, before detectCycle) and C5b is the coupling-parity verb (~400 LOC), stacked on C5a. The override rests on measurement, not symmetry: the coupling verdict is DECORATIVE rather than merely unarmed - deriveEdges converts a serialize decision into nothing, running with explicit --verdicts still yields addedEdgeCount 0, and grep -c coupling on mitosis.js returns 0 - so fixing only the arming would ship a louder inert guard, and C7 is designed to trust these verb receipts. Recorded alongside: the split is a QUALITY decision and must never be reported as a speedup, because review is a flat per-MSP cost so splitting multiplies rather than divides it. Naming trap stated for the record: boundary-gate.mjs carries "gate" in its filename and is not a gate verb.
