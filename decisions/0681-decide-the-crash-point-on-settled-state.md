---
Status: accepted
Date: 2026-08-23T17:47:26.602Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0681. Decide the crash point from settled state instead of racing to win it

## Context

The harness kills the engine on purpose to fake a crash and prove resume works. On the single-unit lane the engine writes its built record and its quiescent-exit record 3 milliseconds apart, while the harness discovers built by polling a file on a loop whose period floor is one second, and then issues the kill unconditionally. The kill therefore always lands after the run is already over, measured at 1555 milliseconds. The engine is killed during shutdown rather than mid-execute, never reaches the ship phase, and opens no pull request. This is why the last billed run charged full price and shipped nothing. The bad ordering is guaranteed rather than intermittent, and the engine commit in that run already carried the separately-fixed resume defect, so this is a second and distinct fault living in the harness rather than the engine.

## Options

- Shorten the poll period so the harness can observe built before quiescent-exit arrives
- Read both records after the fact and branch on whether the crash point is still open
- Move the crash injection to a different point in the run where the window is wide

## Outcome

Branch on settled state. The harness stops racing at all: it no longer needs to observe one record before the other, it reads both afterwards and decides. When the crash point is still open it kills exactly as designed; when the run already went quiescent it declines, records that the crash-resume proof was not exercisable, and waits for the engine to finish so it reaches ship and opens its pull request. Polling faster is rejected on arithmetic — the window is 3 milliseconds and the loop body forks a grep plus a recursive find, so no shell poll period closes it. The honest cost, stated rather than hidden: invocation 1 now runs to completion and releases the run lock, so the lock-refusal leg proves nothing on the single lane, and the single lane cannot exercise crash-resume at all because one unit means the built-but-unfinished state never exists. Restoring that proof needs a different injection point or the four-unit lane, and is filed rather than solved here.
