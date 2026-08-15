---
Status: accepted
Date: 2026-08-15T20:03:00.359Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0444. A retired vocabulary reaches the tree through automerge, not conflict

## Context

C6 carries seven rows in mirror-guard.test.mjs, each reading a boundary module against STANDALONE. Decision 0439 had already retired the STANDALONE class together with the row-per-module mandate, the 55 rows and the count tripwire. During the C6 restack git AUTO-MERGED those seven rows into the new base's INLINED_TWINS with no conflict at all, so no marker was ever written and nothing prompted a human to look. The resulting file did not load: ReferenceError STANDALONE is not defined. Restoring the binding does not repair it either, because divergences() now accepts only WHOLE or an array of export names, so seven assertion failures simply replace the load error.

## Options

- Restore the STANDALONE binding so the seven rows load again
- Keep the rows and widen divergences() to accept the retired class
- Strip the rows from all 20 commits, since a module with no inlined twin now gets no row - chosen

## Outcome

All seven boundary modules occur zero times in .claude/workflows/mitosis.js, so none has an inlined twin and none belongs in INLINED_TWINS under post-0439 semantics. The rows were stripped from all 20 commits, verified by asserting the base blob at that path at every commit in the range, not only at the tip. C6's net drops from 12 files to 11 and mirror-guard.test.mjs is byte-identical to the base. The hazard is DISTINCT from the one already tracked: the existing risk names a silent drop during CONFLICT RESOLUTION, where a human is at least present, whereas this one arrives through AUTOMERGE, where git reports success and no marker exists to review. Both acceptance criteria that encoded the 12-file shape were wrong, having been derived from C6's net diff against the pre-restack base rather than the current one; an unsatisfiable criterion must be corrected, not forced to pass.
