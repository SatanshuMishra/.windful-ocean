---
Status: accepted
Date: 2026-08-17T17:37:05.403Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0540. The ship git site is unreachable, so the engine structurally cannot open a pull request

## Context

A fourth invocation with a healthy GitHub exited 0 in 6.5 seconds, dispatched no children, cost nothing, and opened no pull request. Replaying shipIntegrated with a non-spawning stub showed composition succeeds for every unit with correct titles and honest not-verified lines, and that the spawn is what fails: each composed head names e2e/source/UNIT-integration, and that branch exists on neither the remote nor locally, with compare returning 404. git-commands.mjs defines a complete ship git site including publish as git push -u origin, but buildGitCommand has only three callers, none of them the ship site, so it is unreachable dead code. shipPhase at phase-driver.mjs:251-276 wires no git port, and integrateBuilt receives only boundaryGate and dispatchPrompt, so neither can push. Every shipped e2e test uses a fake gh that accepts any head without checking the branch exists, so the suite validated argv shape while the engine could never ship.

## Options

- Treat the parked ship as an environmental or transient forge problem
- Record that the engine structurally cannot ship, and that the fake gh concealed it by not modelling the branch precondition
- Wire the ship git site now so the run can complete

## Outcome

Record it as structural and stop attributing shipping failures to the forge. c28 is unachievable on this build, so the answer to whether mitosis could be used live today is no, and the reason is a missing wiring rather than a subtle logic error. The deeper finding is the test double: the fake gh models argv shape and not the precondition that a head branch must exist, which is the same narrower-domain pattern as the exec-allowlist gate probing a mocked io. A defect that every test passes over is not a gap in coverage count but a gap in what the double represents. Nothing is wired here, because the acceptance ceiling for this work is a test and the fix ships as its own MSP with this replay as its red case.
