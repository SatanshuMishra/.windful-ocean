---
Status: accepted
Date: 2026-08-18T01:53:49.996Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0553. One invocation reaches Ship by folding Execute's recorded deltas in memory, never by re-reading and never by looping

## Context

Integrate consumed a Resume snapshot taken before Execute ran, so the documented single-call flow built everything and shipped nothing. The audit offered two options and recommended asking before choosing. Both turned out to be wrong on evidence gathered against the live tree.

## Options

- Re-run planResume after Execute and hand that to Integrate and Ship, the audit's cheap option
- Drive the phase loop to fixpoint, the audit's honest option
- Advance the resume view in memory from the deltas Execute already recorded

## Outcome

Advance in memory. Re-snapshot is INCORRECT, not merely cheap: Execute calls writeGenesis which replaces the journal file, and that truncation is a deliberately pinned invariant, so a post-Execute re-read drops a unit built in a prior invocation and empties the shipped set, which makes integrate-plan return early and silently disables the divergence guard. This was not argued but built: substituting a post-Execute planResume produced 12 failures with the prior build's refs missing and divergedParents empty where it should have named a parent. Fixpoint looping is disqualified because a shipped-but-unmerged unit is neither settled nor built, so the work set regrows to the full unit set and Execute re-dispatches every already-shipped unit at full cost, while applyBuiltTransition refuses to downgrade a shipped msp so no progress metric converges, and every pass truncates the journal again. The pipeline has exactly one productive refresh edge, Execute to Integrate; past Ship, progress requires a human merge, so there is no fixpoint to iterate toward. The chosen fold is pure, adds no I/O and no forge probe, and keeps the driver's zero-I/O shape. Consequence worth keeping: the skill's single-call operator contract becomes TRUE for the first time rather than aspirational, so no operator-facing wording changed.
