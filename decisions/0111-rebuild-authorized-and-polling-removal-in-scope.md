---
Status: accepted
Date: 2026-07-30T04:39:15.310Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0111. Rebuild AUTHORIZED by the user; removing token-paying and run-holding waits is in scope and load-bearing

## Context

0106 recorded the rebuild as a RECOMMENDATION explicitly not authorized, and 0108/0109/0110 were architecture-if-we-rebuild. On 2026-07-29 the user stated "Rebuild approved" and asked whether scope includes removing polling. Polling appears in three distinct places: the merge/review wait (MERGE_POLL_MAX_CYCLES 6 x 300s, after which the run reports failed and relaunch re-pays decompose, per 0104), CI completion checks, and PR review-state reads (where a persistent APPROVED was re-counted every poll with no dedup, inflating the speculation window from 3 to 8 off one approval, per 0105).

## Options

- Keep polling and only tune the cycle counts and timeouts
- Remove all waiting mechanisms indiscriminately
- Remove waits that cost tokens or hold a run alive; relocate bounded machine waits into deterministic activities

## Outcome

REBUILD IS AUTHORIZED. 0106's recommendation status is now satisfied; 0108, 0109 and 0110 become binding architecture rather than conditional. POLLING: in scope, and it is the MECHANISM of 0108 rather than a side effect of it. The target is sharpened - what is removed is not polling as such but ANY WAIT THAT COSTS TOKENS OR HOLDS A RUN ALIVE. Three categories resolve differently. (1) The human merge/review wait is DELETED as an engine state: under 0108's end-and-relaunch the run terminates, the journal parks the state, and an external trigger relaunches; waiting stops being something the engine does, which is what makes it free and is the only lever 0104 identified. (2) CI completion is a bounded machine wait and is RELOCATED, not removed - one deterministic activity blocking on gh run watch --exit-status in a backgrounded subprocess, reporting one result, exactly as rules/common/performance.md already prescribes; the wait then costs zero tokens because no cycle re-enters model context. (3) PR review state is read ONCE at relaunch from the journal, which deletes 0105's APPROVED double-count outright rather than fixing it, because repeated observation was the sole source of that bug. OPEN SUB-QUESTION, the last unresolved piece of 0108: what fires the relaunch. Candidates are the human's own merge action (they merge, they resume), a cheap scheduled check implemented as one deterministic activity rather than a live run, or a webhook - the last requiring a server and therefore excluded under the no-direct-cloud-access rule. Default preference is the human action plus an optional scheduled nudge.
