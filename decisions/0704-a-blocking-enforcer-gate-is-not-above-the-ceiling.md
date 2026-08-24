---
Status: accepted
Date: 2026-08-24T05:30:51.883Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0704. A blocking enforcer gate on a change's own lines is in scope, not a filed item

## Context

An implementing agent finished the trunk fix, hit a blocking mutation-gate verdict at the pull request naming ten surviving mutants, and filed it as a new item on the grounds that the work order's declared acceptance criteria contained no clause for that gate. Every line the gate named was a line that same change had written. This is the second reading of the acceptance-is-a-ceiling rule to appear in one session and the two readings send the work to opposite places, so the boundary needed settling rather than re-deciding each time it comes up.

## Options

- Treat a blocking gate on the change's own lines as in scope, cleared or downgraded before the change ships
- Treat any obligation absent from the declared acceptance list as a filed new item, including an enforcer verdict
- Clear the gate in a follow-up change once the current one has merged

## Outcome

A blocking gate on the change's own lines is in scope. Acceptance-as-a-ceiling governs scope that is discovered next to the work; it does not govern the enforcer's verdict on the lines the work itself wrote, and the enforcer is the gate while review is advisory. The follow-up option is worse than it looks and was rejected on a mechanism, not a preference: the enforcer short-circuits on a diff carrying no source change, so a tests-only follow-up passes because the gate never executed. The fix therefore lands on the same branch, where the diff still carries source and the gate actually runs. An unclearable mutant is resolved by a tracked downgrade with a stated reason, never by deferral, and never by a brittle assertion bought only to satisfy the count.
