---
Status: accepted
Date: 2026-08-21T05:39:37.571Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0660. The built-wait heartbeat watches the whole run tree, with an idle limit above the engine's own dispatch timeout

## Context

The first billed single-lane run was killed at 757 seconds by the harness, not by any fault in the engine. The built-wait heartbeat watched the plan-document directory, which only the sequential planning loop ever writes. Once planning ended the directory went quiet, and the heartbeat fired 16 seconds into a live review dispatch, one second after the implement child had exited successfully having written and committed real code. Ten processes were killed. The same wiring would fire on every single-lane run and on the full lane once its last unit is planned, so no billed lane could ever complete.

## Options

- Keep watching the plan directory and raise only the idle limit - the directory is still never written during Execute, so the stall is delayed rather than removed
- Watch the whole run tree and raise the idle limit above the engine's own per-dispatch timeout, so the only thing that can starve the heartbeat is a genuinely dead run
- Remove the heartbeat from built-wait and rely on process death plus the built-wait budget - loses the early stall signal the redesign existed to provide

## Outcome

The heartbeat now watches the whole run tree, which the run store writes on every dispatch start and exit through the per-attempt item, state and usage files. The idle limit is 900 seconds for both lanes, derived as the engine's own 600-second per-dispatch hard timeout plus 50 percent headroom - a heartbeat at or below that timeout guarantees a false stall on one long healthy dispatch. Proven red then green offline with fake processes: the false stall reproduces on the original code, and the true stall and process-death detectors stay green on both sides, so the fix did not neuter the detector.
