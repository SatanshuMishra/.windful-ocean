---
Status: accepted
Date: 2026-08-20T03:20:21.880Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0635. The worktree gate red is a deliberate invariant, blocks no ruling, and stays filed; 0634's blocker claim is withdrawn

## Context

Decision 0634 recorded that a local suite red blocks making the end-to-end test a REQUIRED status check, and therefore blocks c41. Two premises behind that claim were measured and found false, so the user needed the corrected facts before ruling on whether to fix the gate now or leave it filed.

## Options

- Leave it filed against 0549 and finish the thread as scoped
- Fix now by injecting the engine-source root with the canonical path as default, option C
- Fix now by dropping only the hardcoded expected list, option D
- Resolve engine source from the repository under test, option B

## Outcome

USER RULED: leave it filed. The work stays with 0549 and no unit is cut, per the frozen-stack rule that nothing discovered becomes a unit. Three corrections to the record, each measured. FIRST, the cause is not the ~/.claude symlink: with HOME pointed at an empty directory the gate still targets the primary checkout, because a linked worktree's .git is a FILE pointing at the primary checkout's git directory and canonical-config-dir.mjs:78 follows it deliberately, with the home-relative path at :89 only a corroborating second derivation that must agree or the census halts. SECOND, and this WITHDRAWS the blocker claim in 0634: a local red does NOT block making a CI check required, because a required status check is evaluated on CI's run and never on a developer's, and CI is green at b70536fc. Ruling 1 of 0618 is therefore executable as soon as PR 250 lands, and c41 is not blocked behind it. THIRD, the checkout-global census is a deliberate invariant introduced by commit dd7af767 because pairing a canonical roster with a worktree's frozen engine literals dropped a live-dispatched agent from the census WITHOUT failing it; decisions 0511, 0513 and 0549 carry the rationale and 0549 already filed this exact symptom. Reversing it would reinstate that silent false pass. The real defect is narrower than reported: a hardcoded branch-local expected list asserted against a checkout-global census. Scope measured and narrowed against 0549's wider claim: only dispatchable-agent-schema-capable is affected, while determinism and phase-parity resolve worktree-local targets and pass. If it is ever picked up, option C is the right shape because it alone preserves the invariant while making both sides pinnable.
