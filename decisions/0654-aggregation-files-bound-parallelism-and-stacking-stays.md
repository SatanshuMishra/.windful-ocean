---
Status: accepted
Date: 2026-08-21T01:37:04.363Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0654. Aggregation files bound mitosis parallelism, and the resulting PR stack stays

## Context

Every one of the four end-to-end units carries README.md and index.mjs in fileScope.edit, so all four overlap all four. This is not a consequence of the new overlap edge: the lease reads fileScope directly and already serialized them, confirmed by the smoke ticks running one unit per tick even though the decomposer declared only a single dependsOn. After the overlap edge landed, the four pull requests resolve into a chain - each unit's gate base and pull-request parent become the preceding unit's integration branch instead of the trunk. The alternative is four pull requests all based on the trunk, which means three hand-resolved index.mjs conflicts at merge time, since four branches cut from the same base each append to the end of the same file.

## Options

- Keep the chain: each unit is based on its predecessor, merges are conflict-free, but the run opens a four-deep stack
- Flat topology: every unit based on the trunk, no stack, but the operator hand-resolves a conflict per shared file at merge time
- Exclude aggregation files from overlap so units stay independent, accepting silent-loss risk on index.mjs and README.md

## Outcome

Keep the chain. Quality outranks speed, and a visible stack beats three hand-resolved conflicts; excluding aggregation files was rejected outright because it trades a visible conflict for possible silent loss. Two consequences to carry into the billed run rather than treat as defects. First, mitosis's parallelism on any realistic spec is bounded by its aggregation files - a library where every unit adds an export to an index and an entry to a readme has no independent units at all, so the run demonstrates a correctly ORDERED pipeline and the receipt must say so instead of implying throughput it never had. Second, the stack must be merged parent-first, with each parent branch DELETED and its ref confirmed gone before its child is merged, and content arrival asserted by git merge-base --is-ancestor against origin/main rather than by a MERGED label.
