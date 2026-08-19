---
Status: accepted
Date: 2026-08-19T22:28:49.627Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0628. Three rulings before M15's live run: the retry half, the engine pin, and the disarmed sentinel

## Context

M15's phase-1 lead authored the run script, had it reviewed twice (a BLOCK with three CRITICALs, then an APPROVE) and validated twelve items offline, then returned with three questions rather than executing. First, condition 3 as written - a retry that fails and then succeeds - is not expressible against this engine: the only retryable park is the dispatch-failure park at cli.mjs:678, the only deterministic run-document lever for it is request.timeoutMs, and unit-remediation.mjs:11 makes INHERITED_KEYS carry timeoutMs, so the diagnose child that gates the retry inherits the same tiny timeout, times out itself, and parks as diagnose-dispatch-failed with no second attempt. Second, the engine pin moved to a250b142 when M11 merged, and M17 rewrites exactly the plumbing conditions 3, 4 and 4b assert. Third, the harness repo's description does not equal HARNESS_SENTINEL_DESCRIPTION, so assertHarnessRepo throws and the shipped resetToBaseState cannot run at all.

## Options

- Shadow the claude binary on PATH with a stateful fail-then-succeed shim
- Record the succeeding-retry half as unverified-reasoned and prove only that the retry path is entered
- Change unit-remediation.mjs so the diagnose child does not inherit timeoutMs
- Arm the shipped reset by setting the repo description to the sentinel

## Outcome

Retry: record the succeeding-retry half as unverified-reasoned, and file the engine defect rather than fixing it. A stateful shim would make that unit's children fake, which is the opposite of what a live run is for and re-introduces the fake binary c37 deliberately retired; editing unit-remediation.mjs is forbidden because M15 changes zero engine files. The retry PATH is still proven live: markRetryable flips the unit parked to planned and a real diagnose child runs, observable as the unit appearing in two distinct ticks. Filed defect: a dispatch-timeout park can never be retried successfully, because the diagnose child that gates the retry inherits the timeout that caused the park. Engine pin: the live run waits for M17 to land, and the declared terminal states are re-read against the new pin BEFORE the run, never after seeing output. Sentinel: leave the description mismatched on purpose. The mismatch makes assertHarnessRepo fail closed, which disarms the shipped destructive reset entirely; arming a destructive path to gain a convenience is the wrong direction, and the script's own read-only pre-state capture covers the need.
