---
Status: accepted
Date: 2026-08-01T08:23:25.011Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0184. 0183's dead-export-lint residual is settled by measurement: the twin deletion is self-policing and 0180's claim is refuted

## Context

0183 left one residual for M3 to settle before acting: 0180 asserted that dead-export-lint will not catch an orphaned lib predicate because tests count nowhere as callers, and 0183 flagged that this was stated without checking the lint's other clause. Settled two ways this session. Read in the main thread at 7b34a61: dead-export-lint.test.mjs's liveCallerCount is countMatches(mitosisSource, exportName) + siblings + ownModuleCount, so mitosis.js IS a counted caller source and is what keeps lib exports live under the twin architecture. Then measured by the workflow's census agent against a scratch copy under MITOSIS_PATH.

## Options

- Carry 0180's claim forward and treat the orphan risk as silent, requiring manual vigilance in M3
- Settle it by reading the lint mechanism only
- Settle it by reading the mechanism AND running a non-destructive experiment that deletes the mitosis.js occurrences on a scratch copy

## Outcome

SELF-POLICING, CONFIRMED BY EXPERIMENT. Deleting mitosis.js's occurrences of shouldReconcileOnly and hasBuildableWork while leaving reconcile.mjs's exports standing turns dead-export-lint RED, naming ['reconcile.mjs :: hasBuildableWork', 'reconcile.mjs :: shouldReconcileOnly']. 0183's hypothesis is confirmed and 0180's contrary claim is REFUTED. Consequence: the twin-deletion hazard 0180 raised cannot land silently on any future MSP that deletes a mirrored predicate - the lint is the guard, not operator vigilance. This is the fifth instance of the standing method rule paying out (verify a confident finding against the mechanism before acting); 0180 was a confident, careful, wrong finding. M3 shipped with the lint green at 3/3, which is the positive-control half of the same evidence.
