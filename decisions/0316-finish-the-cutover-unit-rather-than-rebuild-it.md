---
Status: accepted
Date: 2026-08-10T06:42:27.136Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0316. The cutover unit is finished from its branch, because its one real defect sits on an axis a rebuild would reproduce

## Context

A read-only audit of feat/config-entry-link-cutover (HEAD ee20348) found the branch is broken in isolation: the committed cutover.mjs imports CUTOVER_ENTRIES, CUTOVER_ASIDE_PREFIX, NOTES_DIRNAME and isInsideResolvedContainer from paths.mjs, but those exports exist only in the UNCOMMITTED working-tree diff. Swapping the dependencies for their origin/main versions crashes with SyntaxError on the missing export, recorded as row M3 of the worktree's own coverage audit. Someone committed cutover.mjs out of a larger coherent block and stranded its prerequisites. Separately, one genuine rollback defect was located: corroborationVerdict and restoreEntry key off the journal's top-level sha rather than each record's own sha (cutover.mjs:309-344, :752-810), while mergeJournal deliberately carries forward records that keep their original sha (:349-355). A record carried from an earlier release is therefore refused forever as foreign-release, its aside is never restored and never even scanned as orphaned, and because restoreEntry maps per entry without short-circuiting, same-generation entries are physically renamed while the call reports status error - a partial mutation reported as total failure. Against that, the audit found the rest sound: ENTRY_STATES is total over 4 states with both preservation and corroboration maps asserted complete structurally by deepEqual, not by inspection; the full suite is 2161 of 2161 green in that worktree; and the 14 modified plus 2 untracked paths group into coherent deliberate work-in-progress, not debris.

## Options

- Finish the existing branch: commit the stranded prerequisites atomically, fix the sha-axis defect test-first, rebase onto main, then review to SHIP
- Rebuild the cutover unit fresh from main, discarding the branch
- Keep hardening in place without first committing the stranded prerequisites

## Outcome

Finish the existing branch. Three BLOCK verdicts made rebuilding tempting, but the audit locates exactly one real defect, and it lives on the record-sha versus journal-sha axis - orthogonal to the entry-state axis the whole design and its test matrix are organised around. A rebuild would re-derive the same state model and reproduce the same blind spot, paying full cost for no coverage of the actual bug. The ordered work is: (1) commit paths.mjs and the rest of the stranded block as atomic commits, since nothing can be reviewed or run until the branch is coherent; (2) fix the sha-axis defect starting from a red test that cuts over to two different releases before rolling back, which no existing test does; (3) rebase the branch, 12 commits behind main; (4) independent review to SHIP, closing c10. The live swap does NOT follow in the same session: 0292 reserves it for a session doing nothing else, and 0286 requires the 0281 rehearsal to run against the sha that actually ships, so it happens after the PR merges.
