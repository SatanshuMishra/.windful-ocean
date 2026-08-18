---
Status: accepted
Date: 2026-08-18T02:35:05.694Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0558. Both reviewers blocked on the branch-deletion guard, and the fixes bind ownership plus tip containment

## Context

A code review and a security review ran independently over the ship stack and both returned BLOCK, converging on the same defects from different angles. The engine had gained the power to delete a remote branch, and the guard did not establish what it was read as establishing.

## Options

- Open the pull request and file every finding, since the enforcer is the gate and review is advisory
- Fix the blocking set against named invariants, file the rest, then open
- Revert the branch-retirement capability entirely

## Outcome

Fixed the blocking set against five named invariants, filed the rest, then opened pull request 209. The advisory-review rule covers findings that break no gate; a deletion whose candidate set was unbounded by the run is a defect, not a preference. Four defects were real and are now closed. (1) The candidate set was every merged pull request under the source prefix, because retirableHead round-tripped a string it had just composed, so a human branch matching the shape was deletable; retirement is now bound to units present in this run's manifest. (2) The gate proved the FORGE-NAMED merge commit was on the trunk, never the tip of the branch being deleted - and under this repo's squash-merge default the tip is never an ancestor, so the check was structurally incapable of proving containment; the current remote tip is now resolved and asserted as a further conjunct. (3) mergeCommit was validated only as a ref token, so an oid of origin/main made the ancestry check compare a ref to itself and exit 0; the destructive path now applies the same sha pattern the read-only resume path already used. (4) An already-merged forge status reported SHIPPED without proving this run's built content was in that merge, which is the inferred-from-upstream-success class this whole stack exists to close; it now parks naming the built sha. The hand-built deletion argv became a transcribed ship/retire-head verb emitting a fully qualified refs/heads ref, closing the tag-deletion ambiguity. Separately the live workflow granted a repository-scoped credential to code authored in a same-repo pull request, reachable by the engine itself now that it opens pull requests autonomously; the pull_request trigger is removed and the harness now refuses to reset a repository lacking its sentinel. FILED, not fixed: no spawn deadline on the ship git steps, verifiedLines narrowing to its head element, an unfrozen manifest out of resume-advance, the in-process test runner intercepting upstream of the exec chokepoint, and the derived-command frozen vectors never being executed against a real incumbent source.
