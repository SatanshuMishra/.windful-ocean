---
Status: accepted
Date: 2026-08-03T07:29:26.818Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0215. The class-0 census, not the security token list, is what actually parks — and seven guards are measured unpinned

## Context

The 40-mutation inertness proof (0214) returned a verdict stronger than the question asked: all four deny-cases for escalation classes 2, 3, 4 and 5 are non-inert at BOTH the unit and the engine level, and two orchestrator predictions were refuted by measurement. Class-0 shadowing is real - deleting 'codeql' from CI_SECURITY_CHECK_TOKENS returns class 0 rather than class 4 - but the tests survive it because they assert `.class === N` rather than truthiness; had they been written as "escalates", the census would have satisfied them and they would have proven nothing. And classes 2-5 are NOT pure-function-only: mitosis-scheduler.test.mjs:4696 drives all five end to end through the real engine, and where a mutation broke a guard the tests caught the real consequence - the autonomous fixer actually running against a failing CodeQL check, a red receipts enforcer, and a cancelled CI run. What the proof also produced is seven mutations that SURVIVED the full 1887-test suite at exact baseline. Each is a measurement, not a suspicion, and in every case the shipped code is CORRECT; what is absent is any test that would catch the guard's removal.

## Options

- Treat the four proven verdicts as the whole answer and close - rejected, it discards seven measured-green mutations
- Record the seven gaps as measured facts with their closing tests specified, and leave the fix unauthorized
- Fix the seven inside this session - not taken, the user asked for a proof and scope belongs to them

## Outcome

Recorded as measured facts; the fix is specified but NOT authorized. The load-bearing finding is that CI_SECURITY_CHECK_TOKENS is far less load-bearing than it appears: for every check name the suite exercises, the class-0 census ALONE suffices to escalate and park, so the token list buys the correct class number and reason rather than the deny itself. It becomes genuinely load-bearing in exactly the region no test covers - a check name carrying BOTH an ordinary and a security token, which the census passes as classifiable and only class 4 can catch. Measured: `dependency-review lint` is class 4 today, and with the list emptied it is `escalate:false` silently with nothing red. Real check names have this shape routinely (`Trivy / test`, `CodeQL build`, `security scan (ubuntu-latest, build)`). Second sharpest: `'invariant-coverage'` is pinned by nothing at all - delete it and the suite sits at exact baseline - and it is not rescued by the census either, because the string contains the ordinary token 'coverage', so its removal would send a failing invariant-coverage check straight to an autonomous fix attempt against this repo's own coverage gate. The remaining five: `'d6'` and `'cluster-boundary'` are each separately deletable because the single fixture contains both, so it pins only "at least one still matches"; case-insensitive ENFORCER matching rests solely on class 4's 'CodeQL'; class 2's PRECEDENCE over classes 3-5 is unpinned, so moving its line below class 5 keeps the suite green and a cancelled run with a red receipts enforcer reclassifies 2->3 silently (both still park, so the consequence is confined to label and reason); and mitosis.js:5209 is deletable outright with nothing reddening, which was TRACED and judged genuine redundancy rather than a hole, since every fix dispatch is gated by the pinned call site at :5327 and an unescalated probe result is re-classified one cycle later - with the caveat, left standing, that the redundancy is undefended. Closing gaps 1-5 is roughly six assertions added to the existing class-3 and class-4 tests (a bare `invariant-coverage` name, a mixed-token name, separate bare `D6` and `cluster-boundary` names, an uppercase enforcer name); gap 6 needs one fixture where two classes are simultaneously true asserted as class 2; gap 7 is a design question, not a test gap. TEST FILES ONLY, no production change.
