---
Status: accepted
Date: 2026-08-03T15:34:45.889Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0220. Delete the preflight rather than neuter it, and re-home the real boundary as a test

## Context

0219 refuted the preflight's premise. The user then asked whether removing the invariants is the cleanup. Two shapes were available: relax the three checks inside the surviving module, or remove the module. The distinction matters because merge-boundary-preflight.mjs emits a machine-readable verdict line carrying passed, bypassVerified and an attestation naming the repo, base branch and invocation path.

## Options

- Neuter: keep the module, relax the three invariants so they always pass
- Delete: remove the module, its test file and its call sites, and re-home the load-bearing property as a test
- Make the gate opt-in behind a declared deployment mode, defaulting off
- Leave it and work around the halt case by case

## Outcome

DELETE, NOT NEUTER. A relaxed gate always passes and emits `passed: true` with an attestation naming the repo and base branch - it reads as assurance while proving nothing. That is the exact shape the module was designed against: an empty check list is deliberately a HALT (:293, pinned at tests/merge-boundary-preflight.test.mjs:613) precisely so that "proved nothing" never renders as PASS. Keeping a hollowed preflight violates the module's own ethic and leaves 1078 lines of maintenance tax. Git history preserves it exactly, so a future multi-party org deployment where the engine genuinely merges is a revert, not a rewrite. SEPARATELY: deletion does not create a gap but leaves one exposed that always existed - nothing verifies that mitosis still cannot merge. If a merge call is added later, or a permissions.deny entry is dropped, nothing catches it; the preflight never checked either. That property is STATIC (a fact about source and settings, not about a remote repo's per-run configuration), so it belongs in the test suite, not a runtime gate - the precedent is tests/merge-boundary-preflight.test.mjs:655-668, which reads SKILL.md and mitosis.js as text to assert a structural property. Replacement is roughly fifteen lines asserting three things: mitosis.js carries no merge invocation, the three merge entries are present in permissions.deny, and the hook still matches the merge patterns. Net trade: a 1078-line runtime gate proving an irrelevant property, for ~15 lines of test proving the load-bearing one, unblocking every solo repo permanently.
