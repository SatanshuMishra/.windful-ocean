---
Status: accepted
Date: 2026-08-14T16:22:45.725Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0424. An incremental porting MSP is inserted before C7 to drain its accumulated obligations

## Context

C7 is SPEC-named as oversized and unsplittable because the tick loop is one unit. It has since accumulated far more than the tick loop: the engine port, seven PROMPT_C7_OBLIGATIONS from C2 of which two are deferred security HIGHs, seven JOURNAL_C7_OBLIGATIONS from C3, and whatever C4 through C6 defer. A known consequence is already on record - the moment mitosis.js gains an import, which C7 does, four lines halt C3's journal census by design.

## Options

- Hold and decide when C7 is cut - rejected by the user: defers the judgment to the point of maximum load
- Stop deferring into C7 from now on - rejected by the user: makes C4 through C6 larger without draining what is already accumulated
- Insert an incremental porting MSP before C7 - chosen by the user

## Outcome

An incremental porting MSP is inserted immediately before C7 and drains the accumulated obligations, so C7 carries only the tick loop it was named unsplittable for. This adds a unit not present in 0374's decomposition. C7's SPEC-named exemption from the review-size target survives, but it is now an exemption for the tick loop alone rather than a catch-all for everything deferred upstream of it.
