---
Status: accepted
Date: 2026-08-24T17:18:08.941Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0713. The unit briefs are repaired in place rather than re-derived, and the unrunnable suite becomes its own unit

## Context

0712 established that all twenty-two briefs name checks that cannot fail. The user directed the repair be made in place - the briefs' verification layer is corrected where it stands, rather than re-deriving the plan or editing the frozen SPEC. Verifying the state live against the published repository at depth 1 on Node 26.4.0 confirmed two of the demonstrated defects independently: the manifest's test script is `node --test tests/unit/`, which Node 26 resolves as a single file and fails MODULE_NOT_FOUND, reporting `tests 1 / pass 0 / fail 1` with no suite executing; and the runner emits its summary with an information prefix rather than a hash, so the `^# (pass|fail|tests)` pattern that U3 and U4 both diff on matches nothing and compares two empty sets.

## Options

- Repair the verification layer of each brief in place, leaving scope and order untouched
- Re-derive the plan from the SPEC against the rule 0712 states
- Continue shipping and repair each brief as its unit is reached

## Outcome

Repair in place. Two consequences follow and are recorded here rather than discovered later. First, repairing a check does not clear it: a check that can fail will fail against the landed import, so the repair converts an invisible pass into a visible blocker rather than into progress. Second, the blocker it exposes is unowned - no unit in the plan makes the suite execute, and the next unit in wave order cannot absorb it, because that unit's acceptance is already satisfied by a suite that exits non-zero for the wrong reason and its receipt requires observing a green that cannot exist. A new unit that makes the suite run precedes every remaining unit, and the vacuity guard stays behind the census units for the reason already standing.
