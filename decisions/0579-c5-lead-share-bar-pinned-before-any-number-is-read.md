---
Status: accepted
Date: 2026-08-18T18:38:12.132Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0579. Pin the c5 Lead-share bar at 50 percent of real dispatches over a minimum window of 20

## Context

Decision 0561 requires a stated threshold pinned BEFORE the c5 measurement window is read, so the result cannot be graded to whatever it happens to be. No threshold was ever pinned - a grep across the SPEC, the u62 acceptance file and all 579 decision records found the obligation stated in 0561 and no number anywhere. U7.1 merged at 2026-08-18T17:29:04Z as PR 212, which opened the window. This pin is made after the window opened but before any number over the log has been read by anyone: the three legs of the close-out dispatch were placed under a hard prohibition on querying the observer event log, and all three returned having computed no share, rate or count. That deviation from the letter of 0561 is stated here rather than hidden.

## Options

- At least 50 percent of real main-thread dispatches reach one of the four Leads - the target architecture's own claim, that the orchestrator routes through Leads and Leads fan out to executors
- At least 25 percent - a floor proving the Lead band is in use while tolerating direct executor dispatch for small units, which the delegation rules permit
- Non-zero - the weakest bar, proving only that the band is reachable, consistent with 0561's statement that a share at or near zero is itself an honest finding
- Measure immediately with whatever the window holds, versus pinning a minimum denominator first

## Outcome

The bar is 50 percent: at least half of real main-thread dispatches in the window reach one of the four Leads (architect, delivery-lead, investigator, researcher). The denominator is real Task-tool dispatches only, excluding artifact-less internal subagents per decision 0537. A minimum window of 20 real dispatches after 2026-08-18T17:29:04Z is pinned in the same breath: below that denominator the criterion stays OPEN rather than closing on a number too thin to mean anything, and a session that does not reach 20 leaves c5 open rather than grading it. Per 0561 a measured share at or near zero remains an honest close that names the Lead band as unreached, and its remedy is the description text in the agent files, since the description is the only routing surface the orchestrator ever sees.
