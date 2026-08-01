---
Status: accepted
Date: 2026-08-01T05:46:54.592Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0183. M3 deletes both gate twins and their truth-table tests in one commit; standing directive is robust-plus-simple

## Context

0180 recorded the twin hazard as a hard M3 constraint but left the disposition to M3's author. The user then issued a standing directive for the fresh session: proceed as recommended, and for any open decision pick the RECOMMENDED ROBUST + SIMPLE solution. That makes 0180 answerable now rather than at M3 time, provided the load-bearing fact is measured rather than argued. Measured at 7b34a61: shouldReconcileOnly (reconcile.mjs:76) and hasBuildableWork (reconcile.mjs:80) are export DECLARATIONS with zero non-test callers anywhere under .claude/lib/superpowers-parallel/ - the only file referencing either is tests/reconcile.test.mjs. The workflow copy carries all three live occurrences (two declarations plus the sole call site at mitosis.js:4223).

## Options

- Delete the workflow copy only, leaving the lib twin and its truth-table tests standing
- Delete BOTH twins plus reconcile.test.mjs:102-131 in the same commit
- Repoint reconcile.test.mjs at the workflow copy through the harness before M3
- Leave the disposition open for M3's author to decide in flight

## Outcome

DELETE BOTH, plus reconcile.test.mjs:102-131, in ONE commit. This is the robust-plus-simple answer under the user's standing directive and it costs nothing: no caller is lost, because the lib twins have none outside their own tests. Robust - it leaves no orphaned predicate and no test reporting green against code nothing calls, which is precisely 0180's failure mode. Simple - one deletion, one commit, no repointing exercise and no dual-maintenance window. The rejected alternative (workflow copy only) is strictly worse on both axes. Option 3 is motion: A3 already characterizes the gate through the harness against the mitosis.js copy, so repointing the lib truth table would duplicate A3's coverage onto code scheduled for deletion. RESIDUAL to verify in M3, and a correction to 0180 rather than a restatement: 0180 asserted dead-export-lint will not catch the orphan because tests count nowhere as callers. That was stated without checking the lint's other clause - dead-export-lint.test.mjs:66-71 also counts callers inside mitosis.js, which is how the twin architecture keeps lib exports live at all. If that clause holds, deleting the workflow call site drops the lib exports to zero counted callers and turns the lint RED, making the deletion self-policing rather than silent. M3 must read those lines and settle it; do not carry 0180's claim forward unverified.
