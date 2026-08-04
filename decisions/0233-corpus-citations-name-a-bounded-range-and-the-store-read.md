---
Status: accepted
Date: 2026-08-04T14:54:20.082Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0233. A decision-corpus citation names a bounded record range and the store it was read in, never an absolute count

## Context

The SPEC and the docket both asserted grounding against "the full 227-record corpus" and "all 227 decision records" in four places. That phrasing is stale by construction. The ledger's plugin-data worktrees sit at different commits: the logbook-inline copy held 227 records when round 1 read it, the logbook-logbook copy holds 230 now, and per 0209 the live ledger is the ledger git ref rather than either plugin-data copy. An absolute count is therefore not checkable by a later reader -- it cannot be reproduced without knowing which store and which commit produced it, and it silently goes false as the ledger grows. The band actually enumerated for this work is 0130-0227, which is 98 records.

## Options

- Keep the absolute count and re-measure it every round
- Cite a bounded record range plus the store read
- Drop the exhaustivity claim entirely and cite nothing
- Pin the count to a specific ledger commit SHA

## Outcome

CITE A BOUNDED RANGE AND NAME THE STORE. Both documents now read "records 0106-0227" with the reading store named, and the four "all 227 records" assertions are withdrawn in place rather than silently rewritten, so the correction is attributable. Re-measuring every round was rejected because it does not fix the defect -- a fresh absolute is stale the moment the next decision lands, and it invites exactly the two-worktree discrepancy that produced this. Dropping the claim entirely was rejected because the exhaustivity claim is load-bearing: it is what tells a reader that a decision missing from section 16 is genuinely non-bearing rather than merely unread. Pinning to a ledger commit SHA is strictly more precise and was rejected only as disproportionate here, since a range plus a store is reproducible by `ls` and a SHA would need re-derivation on every ledger write. Consequence for the outstanding work: the 98-record bearing/non-bearing marking must state its store the same way, and a recount that names no store is not evidence.
