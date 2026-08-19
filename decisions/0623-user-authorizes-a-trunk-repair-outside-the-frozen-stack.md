---
Status: accepted
Date: 2026-08-19T16:04:20.515Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0623. The user authorizes a trunk repair outside the frozen 24 so G9 stops blocking every remaining unit

## Context

Main's own test job fails in CI at observer-audit/tests/retired-roster-derivation.test.mjs:57,:59 and skills/conformance-auditor/tests/skill-shape.test.mjs:183,:212. Neither file is touched by any mitosis unit. Every Session 1 unit shipped carrying a G9 BLOCK whose premise is this inherited red, which makes the gate unable to distinguish a genuine full-suite regression from the standing noise for the five units still to come in Sessions 2 and 3. The stack is frozen at 24 units and nothing discovered becomes a unit, so only the user could authorize the repair.

## Options

- Authorize a trunk repair as a tracked item outside the frozen 24 - restores G9 as a working gate for the remaining five units
- Keep carrying the downgrade to the end of the stack - cheapest, but leaves the gate uninformative for every remaining unit
- Diagnose first and decide afterwards - one round of cost before any repair

## Outcome

Authorized by the user on 2026-08-19, to be completed and shipped in the same session, with the debrief before Session 2 and Sessions 2 and 3 continuing in a fresh session. The repair is tracked separately and adds no unit to the frozen stack. Its bar is that CI's test job goes green on main at the four named sites without any test being weakened, skipped, deleted or made vacuous to get there; a fix in workflow or checkout configuration is preferred over a fix in the tests if that is where the honest cause lies.
