---
Status: accepted
Date: 2026-07-31T18:11:46.347Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0153. ci-red-exhausted is defined and unit-tested in M1 though only M8 can produce it

## Context

Spec section 6's terminal-status table has exactly four rows, one of which is ci-red-exhausted for a unit that exhausted the CI loop. The CI-to-green loop is M8, which depends on M1. Nothing in the engine can yield a nonzero exhaustion count until M8 lands, so shipping the status in M1 means shipping a branch of computeMergePolicyStatus that no production path reaches yet - which reads as dead code to anyone auditing the diff, and to M8's implementer.

## Options

- Defer ci-red-exhausted entirely to M8, so M1 ships only the three statuses that have producers
- Define it in M1 as a ciRedExhaustedCount parameter defaulting to 0, unit-tested directly, with no producer threaded
- Define it in M1 and invent a provisional producer so the branch is reachable

## Outcome

Option 2. The parameter defaults to 0 and is NOT threaded through computeParkedStatus (mitosis.js:3122), so every current call site is unchanged; the branch is exercised by direct unit tests, including that it suppresses awaiting-approval when awaiting work coexists. Option 3 was rejected outright: a provisional producer would be a fabricated capability. Option 1 was rejected because section 6 is the honest-terminal-states contract and M8 depends on M1 partly for this vocabulary - defining it here is the contract M8 fills, not speculation. The PR and the coverage entry both state plainly that no producer exists yet. M8's implementer must thread a real count rather than assume one is already wired.
