---
Status: accepted
Date: 2026-08-01T20:03:02.251Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0190. A5 withdraws G3 on measurement and ships four of five gaps as five tests; G5 pins the constants but not the wiring, and that limit is declared rather than overclaimed

## Context

0189 scoped A5 to five gaps proven unpinned by mutation. During execution the design phase proposed withdrawing G3, readReviewDecision's null-result fallback and its catch branch. The implementer did not relay that proposal - it re-ran G3 as mutation against four test files, and the inertness verifier then re-derived the same two mutants independently with its own harness rather than accepting either account. Separately, the implementer discovered that its own G5 test pins less than the gap description implied and declared the shortfall instead of letting the receipt imply full coverage. Both are scope changes against a committed decision, so both are recorded rather than left in a workflow transcript.

## Options

- Ship all five gaps as scoped by 0189, writing a G3 test regardless of what measurement showed
- Withdraw G3 on the measured result and ship the remaining four gaps as five tests
- Withdraw G3 and additionally widen G5 into the call site so the wiring is pinned too
- Halt A5 and re-scope it against 0189 before shipping anything

## Outcome

WITHDRAW G3, SHIP FOUR GAPS AS FIVE TESTS, DECLARE G5's LIMIT. G3 splits into two halves and measurement kills both for opposite reasons, each result reproduced independently by the adversarial verifier against a 247-pass four-file baseline. The catch branch at mitosis.js:5023-5025 mutated to rethrow gives 245 pass / 2 fail, reddening two existing tests in mitosis-scheduler.test.mjs - it is ALREADY load-bearing, so a new test duplicates it and fails admission-gate criterion 2. The null-result fallback at :5022 mutated to return the raw result gives 247 pass / 0 fail - it is INERT BY CONSTRUCTION, because no observable separates the two return values, so any test written for it could not fail. A gap that cannot be reddened is not a gap worth a test. The shipped set is G1, G2, G4a, G4b and G5 as five tests in .claude/lib/superpowers-parallel/tests/merge-poll-characterization.test.mjs. MUTANT MATRIX, six mutants against five tests, each anchor confirmed to occur exactly once: every mutant reddens exactly one test and the diagonal is clean, zero inert tests, with the single two-to-one cell being G5a and G5b both killing T5 because T5 pins two constants. The verifier reproduced all six with its own harness, its own scratch engines and its own TAP parser rather than reusing the implementer's. Suite 1838 to 1843, delta exactly +5, and the 1838 baseline was RE-MEASURED with the file moved aside rather than derived by subtraction. Engine md5 identical to cad6ba2 for mitosis.js, leases.mjs and reconcile.mjs, so the no-extraction ruling held. G5's DECLARED LIMIT, and this is the honest part: mergeWatchPrompt internally defaults to 300 and 30 at mitosis.js:2817-2818, so T5 kills a changed-constant mutant but is BLIND to a dropped-opts mutant at the :5068 call site, because both render an identical prompt. G5 therefore pins the values and not the wiring. Widening it was declined rather than forgotten - the observable does not exist without a production change, and A5 is a zero-production-change MSP. Whoever owns M5 should know the call-site wiring is unpinned. Two receipt rows also state candidly that B3's guarded-intrinsic enumeration and B5's census rows were not read member by member, with the 1843-pass suite named as the standing receipt instead.
