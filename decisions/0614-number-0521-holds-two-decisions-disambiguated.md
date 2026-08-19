---
Status: accepted
Date: 2026-08-19T02:43:15.928Z
Thread-Id: 01M0BV3M8GKVP5HSQKB19Z9WW8
---

# 0614. Number 0521 holds two different decisions; both are named here rather than renumbered

## Context

An audit on 2026-08-18 found 614 decision files carrying 613 distinct numbers. The duplicate is 0521, and it is two genuinely different decisions rather than one record under two slugs: 0521-e2e-proof-runs-live-not-on-the-fakebin-substrate under thread 01KZTEFMENXBW30ZE633YNFJHE written 2026-08-17T15:23:46Z, and 0521-stacked-prs-for-blocked-msp-chains under thread 01M04HH9W6HVPQJDPW24WH48GC written 35 seconds later at 15:24:21Z. Different threads, unrelated subjects, two distinct blobs. No content was lost, because the differing slugs meant neither file overwrote the other and both are pushed. What is damaged is the NUMBER: a bare citation of 0521 resolves to two decisions, and read_decision on it has two candidates.

## Options

- Renumber one occupant to the end of the sequence
- Record a disambiguation naming both and renumber nothing
- Leave it undocumented since no content was lost

## Outcome

Record the disambiguation; renumber nothing. Renumbering rewrites append-only history and breaks every existing citation of whichever record moved, which is a larger harm than the ambiguity it removes. Silence was rejected because a bare number is exactly how decisions are cited in this project, so the ambiguity is live rather than theoretical. Both occupants stand. Cite 0521 by SLUG and never by bare number. The underlying allocator race is filed upstream against the plugin and deliberately not patched locally, because the live code sits in the plugin cache where any edit is erased by the next update. One speculative lead is recorded with it and not acted on: the 35-second separation is far too wide for the millisecond read-then-write window inside a single handler, which fits a different mechanism - two worktrees sitting at different commits, each scanning a decisions directory the other's newest records had not yet reached, so both computed the same max. If that holds, the double plugin registration and the allocation race are one bug, and deregistering the duplicate install would remove the collision cause locally. Nobody has verified whether the driver pulls before allocating, so it stays speculative.
