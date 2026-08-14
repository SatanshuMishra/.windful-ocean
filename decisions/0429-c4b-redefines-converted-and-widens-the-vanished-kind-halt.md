---
Status: accepted
Date: 2026-08-14T20:41:04.042Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0429. C4b redefines converted and widens the vanished-kind halt, filing C7-T4 in place of the impossible T13

## Context

C4b's plan carried task T13, which C4a's census semantics had since made impossible to satisfy as written. The choice was to force the original task, drop it silently, or replace it with something that holds under the new semantics.

## Options

- Force T13 as written - rejected: impossible under C4a's census semantics
- Drop T13 silently - rejected: an unnamed gap is indistinguishable from an unnoticed one
- Redefine converted, widen the vanished-kind halt, and file the remainder as C7-T4 - chosen

## Outcome

The term converted was redefined and the vanished-kind halt was widened rather than narrowed, with both reviewers independently confirming the replacement is stronger rather than merely more permissive - the test that separates a genuine replacement from a quiet weakening. What the replacement does not cover is filed as C7-T4, a named obligation that now drains through the porting MSP inserted by 0424.
