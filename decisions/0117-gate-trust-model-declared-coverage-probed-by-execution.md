---
Status: accepted
Date: 2026-07-30T05:47:03.871Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0117. Gate trust comes from declared coverage probed by execution, differential comparison, and per-work-type floors that halt fail-closed

## Context

The user moved review to a gate-first model: anything a gate can catch NEVER goes to review. They asked how a gate pass can be trusted across projects with different test infrastructure, and whether mitosis should add that infrastructure where it is missing.

## Options

- Treat a gate pass as sufficient and route only what gates cannot express to review
- Declared-coverage model - a pass means only the declared, failability-proven set is satisfied, everything else is named residue
- Require a uniform test baseline in every target repo before mitosis will run

## Outcome

DECLARED-COVERAGE MODEL, all five sub-questions APPROVED. A gate pass can NEVER mean "no issues"; designing toward that promise rebuilds the exact failure 0112 names, and 0107 already caught it live - the suite ran the engine in a MORE PERMISSIVE environment than production, so green certified nothing and nobody knew. A pass means only: every property this project has declared checkable, and proven able to fail, is satisfied. THREE CONDITIONS: declared coverage; proven failability; explicit residue, so everything outside coverage routes somewhere named. THREE TIERS by portability: (1) universal gates mitosis ships free in any git repo - PR title grammar, conventional-commit form, fileScope violation, secret scan, no-comment/no-emoji, diff size; (2) discovered gates mitosis finds and runs - lint, typecheck, build, test; (3) the receipt, authored per change, the ONLY gate whose failability is structurally proven every time, which is why 0110 chose fix first. PROBE BY EXECUTION, NEVER BY CONFIG DETECTION: a gate-probe verb runs each candidate against the UNMODIFIED BASE and records present / absent / BROKEN (non-zero on a clean base - the state detection-based approaches miss entirely and which is common in real repos). This is the direct application of the 0103 mistake 0107 caught: code presence read as evidence of execution. Output is a gate manifest journaled with each gate's command string and hash, part of the journal key per 0108 specific 1, so a changed gate cannot reuse a stale verdict. ALL PROJECT GATES ARE DIFFERENTIAL, never absolute - gate on NEW findings by running both sides and diffing the multiset, which mitosis.js:1206-1228 already does correctly (multiset identity diff plus config-strictness diff so a task cannot pass by loosening config); gate-lint GENERALIZES that design rather than replacing it, and it is what makes a broken gate survivable. PER-WORK-TYPE FLOORS, and an unmet floor HALTS FAIL-CLOSED naming the missing capability - it NEVER silently degrades to review, which is how a gate system becomes theatre. INFRASTRUCTURE, the sharp line: mitosis DOES deploy its OWN gates into target repos (already established practice - receipts.yml ships pr-title-lint) and DOES author one receipt inside an existing runner; it does NOT choose a test framework, author a suite, or bootstrap infrastructure as a side effect of shipping a spec - that is unbounded architectural work done silently. The gap is made loud and named, then points at the existing human-invoked verify-setup skill. REVIEW STILL OWNS: is this the right design, does it satisfy spec INTENT, is this a security hole that is not a lint rule, is the abstraction wrong. PAYOFF: the manifest feeds pr-create's Verified / Not verified lines MECHANICALLY, so the honesty rule stops depending on a model's restraint. LANDS folded into step 6, not as a new step, since the receipt IS the fix pipeline's oracle.
