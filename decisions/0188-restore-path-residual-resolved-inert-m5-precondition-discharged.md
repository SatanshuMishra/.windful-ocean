---
Status: accepted
Date: 2026-08-01T18:51:14.011Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0188. 0187's restore-path residual resolves INERT by exhaustive path enumeration; M5's precondition is discharged and a sha-verification weakness is named instead

## Context

0187 assigned the orphaned toRestack log line to the next region owner and left ONE residual explicitly gating M5: whether every route by which a BUILT unit reaches ship passes through restoreIntegrationFromBuiltCheckpoint. If any path shipped a built unit without restoring, M3's dropped eager restack was load-bearing there and its deletion is a real regression rather than the inert cleanup PR 30 claimed. This was the branch point for choosing the next MSP: a REGRESSION verdict would have made the next MSP a fix, not A5. A read-only agent enumerated the restore call sites and the ship sites independently and crossed them, reading every file from the origin/main blob at cad6ba2 rather than the dirty working tree.

## Options

- Accept 0187's probable-inertness reading and proceed to M5 without checking
- Enumerate ship paths exhaustively and cross them against the restore call sites before any M5 work
- Hotfix defensively by re-adding a restack on every ship path regardless of the finding
- Defer the question again and pick an MSP that does not touch the region

## Outcome

INERT - VERDICT CONFIRMED BY ENUMERATION, NOT BY ARGUMENT. All citations are origin/main at cad6ba2. restoreIntegrationFromBuiltCheckpoint is mitosis.js:4545-4581; every one of its guard-clause exits PARKS with ready:false (:4546-4548 null or unparseable builtRef, :4567 restore-agent not Done, :4568-4570 restored not true), so no early return leaks into a ship. Its two call sites are the isBuiltResume branch (:4586) and the isFrontierBuiltRedispatch branch (:4592). Independently, shipOneMsp (:4922) is the SOLE PR-open surface, finalizeShip (:4971) its sole caller, and finalizeShip has exactly three call sites: :4588 and :4596, each immediately after a successful restore, and :4986, the fall-through at the bottom of runUnit reached only when Plan, Plan-review, Parallelize, Branch and Execute all ran in the SAME call. runUnit (:4513) has one production caller, joinTick (:2353), itself called only from runScheduleTick - there is no second advance implementation left after M3. So the only restore-free ship is a unit shipped in the tick it was built, where nothing has moved integrationBranch away from what Ship expects. M5's precondition is DISCHARGED; M5 may build on this region. Three paths were checked and are recorded so nobody redoes them: a unit parked at stage ship without built:true is re-seeded as planned rather than built because park (:2494-2521) unconditionally overwrites status, and Parallelize/Branch/Execute carry no skip guard, so that path rebuilds integrationBranch fresh (git branch -f off origin baseBranch at ~:4816) instead of restoring; supersedeOpenPr (:4386-4421) is DEAD CODE with zero call sites tree-wide and is not a ship path; the streaming and reconcile-only mechanisms are absent from the blob entirely. ONE NEW WEAKNESS NAMED RATHER THAN BURIED, and it is NOT the residual just closed: the isBuiltResume call at :4586 passes only builtRef, leaving expectedSha and requireSha undefined, so the sha-verification block at :4572-4579 never runs on that path, while the frontier redispatch path at :4592 passes requireSha true and gets full verification. That is a weakness INSIDE a call that does happen, not a route that skips the call, so it does not reopen the residual - but the built-resume path ships on a weaker check than the frontier path and that asymmetry is now on the record for whoever owns M5.
