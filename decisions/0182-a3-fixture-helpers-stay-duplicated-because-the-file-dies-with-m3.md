---
Status: accepted
Date: 2026-08-01T05:40:17.582Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0182. A3's fixture helpers stay duplicated rather than extracted, because the file dies with M3

## Context

The conventions verifier measured that 162 of the new test file's 212 substantive lines (76 percent) are byte-identical copies of helpers in frontier-train-e2e.test.mjs - hexSha, invoke, manifestMsp, frontierManifest, checkpointPages, prNumber, targetPrUrl, mergedPr, withHonestProbedRef, withReconcileDefaults, shepherdAgent, plus the whole header block. It rated this MEDIUM and proposed extracting a shared frontier-fixtures.mjs following the status-fold-cases.mjs precedent, noting the copy is governed by neither the shared-fixture-module precedent nor the policed-twin doctrine.

## Options

- Extract the shared block into tests/frontier-fixtures.mjs and import it from both files
- Keep the duplication and record it honestly in the coverage receipt
- Extract only after M3 lands, when the survivor set is known
- Ship the duplication silently

## Outcome

KEEP THE DUPLICATION, recorded rather than silently shipped - the receipt carries it as an M2 threatened verdict. The finding is technically correct and the fix is still declined on lifecycle grounds: this file exists to be deleted. It characterizes code M3 removes, so extracting its helpers into a module that frontier-train-e2e.test.mjs also imports would leave shared residue outliving the thing it was factored out of, and would edit a load-bearing e2e file inside a test-only MSP whose entire claim is that it changes nothing else. The duplication is bounded, inert, and disappears with the file. Two smaller findings from the same lens WERE applied before commit, because both concerned the artifact's accuracy as documentation rather than its structure: T3's p2 fixture gained dependsOn ['p1'] so it genuinely exercises the all-parents-merged path its assertion message claims (it previously had zero parents and passed vacuously), and both park reads moved from result.parked[0] to find-by-mspId per frontier-train-e2e.test.mjs:1396. Both re-verified: 1850 pass, and Mc still kills T3 alone. Revisit extraction only if M3 slips indefinitely and the file becomes long-lived.
