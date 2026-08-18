---
Status: accepted
Date: 2026-08-18T19:26:57.993Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0584. c5 measured: Lead share 85.71 percent clears the bar, attribution and outcome clauses do not

## Context

Measured on a frozen 2898-row snapshot of the live observer store, md5 97715434a4d912fe3a4545851c456076, taken 2026-08-18T19:20:03Z. n = 21 real main-thread dispatches after the 17:29:04Z window opening, resolved at dispatch grain before counting; the exclusive and inclusive boundary give the same 21, as does deriving main-thread from parent_agent_id instead of depth. Lead share 18 of 21 = 85.71 percent against the 50 percent bar pinned in 0579. researcher was reached ZERO times and that is stated as an honest zero per 0561. Attribution is 100 percent over the n population and 11.46 percent corpus-wide. The derived outcome census is closed and sums: 8.89 percent completed, 1.05 percent inferred dead, 0.60 percent in flight, 89.47 percent stop-without-start. Three qualifications are on the record. n is ONE dispatch above the gate, and two defensible readings put it under: requiring termination gives 18, scoping to this repository gives 11. The window is self-contaminated - 13 of the 21 dispatches are the delivery-lead this very audit ran on, dispatched under a user instruction that named a Lead explicitly. And the repaired predicate never yields internal, because 2202 stop-only rows carry a non-null transcript path pointing at a file that was never created, so the predicate tests non-nullity where it needed existence.

## Options

- Close c5 on the Lead-share result alone, since the pinned bar was cleared
- Record the Lead share as measured but hold c5 open, because two of its three clauses are unmet on the same evidence
- Treat the corpus-wide attribution figure as the observer's true coverage
- Treat the 2202 stop-only rows as artifact-less internal firings and exclude them, which would restore attribution to roughly 100 percent

## Outcome

The Lead-share clause is MET and recorded at 85.71 percent over n=21. c5 does NOT close on this measurement, because its other two clauses are not met on the same evidence and that is fact rather than judgement: the observer does not attribute every run, at 11.46 percent corpus-wide, and it records no outcome for 89.47 percent of dispatch partitions, which arrive as a stop with no start. Whether those 2202 rows are genuine artifact-less internal firings or real dispatches whose start rows were DROPPED is unsettled and is the deciding evidence for the attribution clause - the two readings differ by roughly 88 percentage points and must not be assumed either way. Two judgements are explicitly reserved for the human and are not decided here: whether a window whose majority is the audit's own delivery-lead dispatches can verify routing in real use at all, and whether c5's "records an outcome" should be reconciled with 0524, which made the absence of a stored outcome field deliberate.
