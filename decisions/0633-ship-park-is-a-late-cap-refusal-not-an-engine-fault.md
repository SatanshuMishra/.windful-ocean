---
Status: accepted
Date: 2026-08-20T01:25:18.013Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0633. The M15 Ship park is a late-enforced value cap; classified architecture, filed not fixed

## Context

M15's live run opened 2 of 3 pull requests. numbers-clamprange integrated cleanly, then Ship reported state parked with action null, which is the sole cause of check 1's failure and of four further failed assertions in check1b and check3. c28's remaining question was whether that park is a bug or an architectural inadequacy, to be filed rather than fixed in flight per RUNBOOK rule 3.

## Options

- Treat the park as an engine bug and fix the Ship path in flight
- Classify the refusal as correct-by-design and file the late-enforcement inadequacy as architecture
- Soften c28's criterion so 2 of 3 counts as one pull request per MSP

## Outcome

Classified ARCHITECTURE, filed not fixed. The unit's rationale is 226 characters against the 200-character cap every pull-request body value carries (pr-format.mjs:4 and :57), so composePrCreateArgv returned not-ok and ship-plan.mjs:395-397 parked the unit rather than truncate a field. That refusal is deliberate and correct: a placeholder in an immutable body is a claim nobody made. The inadequacy is that a statically checkable spec constraint is enforced only after a billed dispatch, a checkpoint, an integrate pass, a rebase and a remote push, all of which succeeded and were then discarded. One separable BUG was also filed: a Ship-stage park is never journaled, because ship-plan.mjs reaches appendJournal only at :347 on the success path, so the diagnosis dies with the process. The units[] value of done is NOT a second defect; it comes from the leases vocabulary at leases.mjs:91 by way of cli.mjs:523, which is a different surface from unit-state.mjs's PROGRESS_ORDER. M15's check 1 stays failed and the failure is the engine's, not the harness's. Separately, the engine-pin-post-check red carries no information either way: run-live.sh:424 prints result=ok unconditionally after the divergence branch already fired, and tree_hash at :14-16 folds the absolute path into the digest, so that comparison is structurally incapable of passing. The pin was not violated, proven by four independent lines including a content-only manifest that covers the gitignored graphify-out directory git cannot see.
