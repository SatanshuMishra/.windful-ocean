---
Status: accepted
Date: 2026-08-21T06:41:17.767Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0662. A unit that reached built is dropped on resume, so the run ships nothing after paying for the work

## Context

The fourth billed run cleared every earlier blocker and reached the comparator with no abort. Its journal records the unit reaching built, then a quiescent exit, then a fresh genesis from the resumed invocation, then a second quiescent exit. The resumed invocation reported nothing-pending: the built unit was neither carried into Ship nor listed as pending. No pull request was opened, the substrate stayed empty, and six of eleven declared criteria failed as downstream consequences of that one loss. This is the state-loss family 0571 suspected, now reproduced with the unit having genuinely completed its implement and review work rather than dying mid-dispatch.

## Options

- Root-cause the resume and Ship handoff before spending another billed run - the next run fails identically without it, so the cost buys no new information
- Re-run and hope the kill lands at a recoverable point - treats a reproducible state loss as a flake and pays full price to learn nothing
- Remove the deliberate mid-flight kill from the lane so the run reaches Ship - would produce a shipped pull request while hiding the defect that a real interrupted run would hit

## Outcome

Root-cause first, no further billed run until the built unit survives resume. The evidence is already captured in a preserved scratch directory, so the diagnosis costs nothing further. Removing the kill is explicitly rejected: it would manufacture a green by deleting the leg that found the defect, and the resume path is a declared criterion in its own right.
