---
Status: accepted
Date: 2026-08-14T23:47:45.968Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0430. The C4 chain is restacked onto the merged base rather than conflict-resolved at merge

## Context

During run 6 the user merged #100-#103 in a parallel session and force-pushed c1, c2 and c3. The base moved f252fef7 to d11f7693 and the old c3 head 4656b8ad stopped being an ancestor of it, so merge-base(7f0e7513, d11f7693) fell back to 18d5e4c9 (B3's head, the one branch never rebased). GitHub therefore replayed C1+C2+C3 under old SHAs onto a base already carrying them under new SHAs, and #105 went CONFLICTING. The merges themselves were content-faithful: d11f7693 tree equals 4656b8ad tree equals 8be55ea4, and git diff between them is empty.

## Options

- Restack c4a, c4b then c4c onto the merged base and force-push each
- Leave history alone and resolve the duplicate-patch conflicts by hand at merge time
- Close #105 and #107 and re-cut both from the new base

## Outcome

Restack, ruled by the user. Each branch replayed only its own commits with --onto, verified by TREE-SHA EQUALITY before every force-push rather than by diff stat: c4a must reproduce 90d630d9, c4b 247c5314, c4c its own re-measured ship-head tree. All three rebases exited 0 with zero conflicts, all three trees matched exactly, and #105 flipped CONFLICTING to MERGEABLE. Manual conflict resolution was rejected because every conflict hunk is a place a line can silently revert, which is the failure decisions 0388 and 0416 already record. A caution the round earned: an anchor measured mid-flight goes stale. The c4c target circulated as 3426c09e, measured at ce5a40a8 before the fix rounds; using it would have certified the branch against a pre-fix-round tree and silently attested that five HIGH fixes had been dropped. Re-measure a restack anchor at the head actually being rebased, never pin one measured earlier.
