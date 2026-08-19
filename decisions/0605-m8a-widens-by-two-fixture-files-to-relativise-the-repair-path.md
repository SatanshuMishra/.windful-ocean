---
Status: accepted
Date: 2026-08-19T01:03:45.936Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0605. M8a widens by two test-fixture files so the boundary-fix repair path is relative to the head worktree

## Context

M8a's lead returned blocked on 2026-08-19 before writing production code: restored M0 gate test 1 (violating unit is integrated after one fix) cannot go green from M8a's five files because tests/e2e-substrate.mjs:619 bakes an absolute repair path under sandbox.repo, which after M0 froze main carries no unit files; tests/e2e-fake-bin.mjs:82-86 reads that path and exits 79, so integrate-plan.mjs:178 parks. Rule 3 does not fit (it is the acceptance criterion itself) and rule 2 leaves a red test on the branch, which A9 already ruled non-negotiable.

## Options

- Ship test 2 green and record test 1 as unverified-reasoned - breaks the green-branch invariant
- Widen M8a by tests/e2e-substrate.mjs (:619 relative path) and tests/e2e-fake-bin.mjs (resolve against cwd), dispatch the fix child with cwd headPath in integrate-plan.mjs; condition: node --test tests/e2e-*.test.mjs exits 0
- Return the residue to M0 as a new unit - breaks the freeze

## Outcome

Option 2. The absolute path is the un-updated other half of M0's own topology edit, not new scope; e2e-fake-bin.mjs has no owner row and e2e-substrate.mjs's other owner (M16) touches assertion helpers only; it also gives A13's dirty-worktree carve-out its purpose. Binding condition: A9's reader-side obligation node --test .claude/lib/mitosis/tests/e2e-*.test.mjs must exit 0; if it reddens e2e-ship-cycle, e2e-ship-pr or e2e-ci-green the lead returns again rather than widening further. Both files are stated in the PR body as the fixture completion of M0.
