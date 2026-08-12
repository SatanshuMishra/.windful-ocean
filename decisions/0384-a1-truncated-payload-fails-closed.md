---
Status: accepted
Date: 2026-08-12T22:25:08.388Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0384. A truncated dispatch payload fails closed, and runChild's refactor is deferred

## Context

A1's review surfaced three questions the SPEC does not settle. Code review argued that returning ok:false for an over-cap payload is stricter than SPEC law 3.3 compels — the law requires only a truncated marker — and that under A2's failure propagation it turns a substantively-completed run into a blocked cascade for its dependents. Separately, runChild is 185 lines with six levels of nesting, violating the under-50-line and max-four-nesting rules while holding every termination invariant. Third, the two reviewers disagreed on whether `claude -w` takes a name or a path.

## Options

- Return ok:true with truncated:true and let A2 decide
- Keep ok:false so a truncated judgment payload fails closed
- Refactor runChild in the same commit as the behavior fixes
- Defer the refactor to its own commit guarded by the existing dispatch tests

## Outcome

payload-truncated KEEPS ok:false. A truncated judgment payload is incomplete, and a downstream consuming half a plan is worse than a blocked cascade for dependents; it fails closed, which matches the directional contract adopted for pathsOverlap. Flagged for SPEC ratification rather than loosened now. runChild's refactor is DEFERRED to its own commit, guarded by the 79 existing dispatch tests as the characterization suite — mixing a refactor of the function holding every termination invariant into a behavior-fix round is exactly what the project's commit rule forbids. The `-w` question is RESOLVED as a name, not a path, from `claude --help` showing `-w, --worktree [name]` creating a worktree; the existing validation is therefore correct and the test label now cites the help output instead of asserting an unverified CLI fact.
