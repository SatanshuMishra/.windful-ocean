---
Status: accepted
Date: 2026-08-01T05:39:46.073Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0180. M3 must delete BOTH gate twins or reconcile.test.mjs stays green against an orphan

## Context

While designing A3's characterization test, the design agent measured that shouldReconcileOnly and hasBuildableWork exist TWICE: mitosis.js:3063/:3067 and reconcile.mjs:76/:80. The only unit tests of those predicates (reconcile.test.mjs:102-131, an exhaustive truth table) import the LIB copy, not the workflow copy. M3's deletion target per 0161 is the workflow copy.

## Options

- Let M3 delete the workflow copy only, leaving the lib twin and its truth-table tests in place
- M3 deletes both twins in one commit, and reconcile.test.mjs:102-131 goes in that same commit
- Repoint reconcile.test.mjs at the workflow copy now, before M3
- Ignore it and let M3's author discover it

## Outcome

RECORDED AS A HARD M3 CONSTRAINT, not resolved here. If M3 deletes only the workflow copy, reconcile.test.mjs:102-131 keeps passing against an orphaned lib predicate that nothing calls, and the suite reports false assurance for a gate that no longer exists in the engine. If M3 deletes both, those tests must be removed in the SAME commit or the suite goes red. Either way M3's author must decide deliberately; the failure mode is silent. A3 deliberately sidesteps the ambiguity: its four tests drive the mitosis.js copy through the AsyncFunction harness, so they die with exactly the code they characterize rather than surviving as an orphan. Verified by the mutation lens: OWN1 (shouldReconcileOnly forced to return false at mitosis.js:3064) and OWN2 (runReconcileOnlyAdvance body gutted at :3293) each turn all four A3 tests red, which is the M3 deletion-observability evidence - the deletion cannot land silently. Note the dead-export-lint interaction: tests count nowhere as callers (dead-export-lint.test.mjs:66-71), so the lint will NOT flag the orphaned lib predicate for us.
