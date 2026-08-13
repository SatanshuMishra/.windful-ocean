---
Status: accepted
Date: 2026-08-13T05:49:23.708Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0387. A1's dispatch suite guards only the escalation flag, so the refactor ships on other evidence

## Context

0384 deferred runChild's refactor to its own commit "guarded by the existing dispatch tests as the characterization suite". An inertness battery of eight plausible unsafe rewrites, run independently rather than author-reported, measured that premise as false: seven stayed green against all 95 tests. Only M6, dropping the escalated flag, reddened, and only because escalated is a directly asserted output field. M2 and M3, the terminate statement orderings, are redundant-by-construction against the current call graph, so no test could distinguish them. M7, copying state instead of aliasing it, is provably inert because the sink is a string primitive and the handler has no yield point. M1, M4, M5 and M8 are genuine holes: stream independence, liveGroups release, abort-listener removal and timer registration. M4, M5 and M8 are equally green on the parent commit.

## Options

- Ship on the suite as 0384 assumed, treating 95 green as sufficient
- Block the refactor until all four genuine holes are closed
- Ship on stronger evidence, close only the hole the refactor itself opened, and file the pre-existing three
- Abandon the refactor and leave runChild at 190 lines

## Outcome

SHIP on stronger evidence than the suite alone. The refactor is verified by line-by-line review of every extracted closure, by running the parent's unmodified 95-test file against the refactored dispatch.mjs, and by the 185 string literals in dispatch.mjs being unchanged. One hole is closed here: the extraction moved the per-stream closed flag and decoder from closure locals into a reader object, making stream independence a NEW explicit invariant, so a test now reddens when one reader is shared across stdout and stderr. M4, M5 and M8 are pre-existing gaps in A1's suite, not damage from this change, and are filed rather than fixed so a style refactor does not become a test-writing project. The standing lesson generalizes: a green characterization suite is not evidence until a mutation battery shows it can go red.
