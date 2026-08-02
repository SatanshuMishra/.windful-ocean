---
Status: accepted
Date: 2026-08-02T07:32:04.350Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0203. The buildAheadCap override is bounded to 1..BUILD_AHEAD_CAP and halts on anything else, adopting the arg boundary's halt convention

## Context

Audit F3 refuted the drafted one-line remedy as the wrong surface and proved by execution that buildAheadCap is the ONLY scalar knob at the arg boundary that accepts invalid input and proceeds; fixLoopMax, retry.maxAttempts, retry.runBudget, models and the ref/path fields all halt via haltReport('input', ...). It also found a hole the ship-gate report never named: buildAheadCap 9999 is silently ACCEPTED and widens the build-ahead frontier unbounded with no log, proven live by running the committed leases.mjs planTick (window 8 withholds a child, window 9/9999/1e6 admit it). That contradicts the headline of 777617b, which calls itself a FIXED build-ahead cap. The drafted fix would have made the safe direction (refusal, cap holds at 8) louder while leaving the dangerous direction silent, and would have invented a third null convention in a codebase already split between null-collapses-to-absent and null-halts. F3 flagged the upper bound as a policy choice needing the user because 777617b's body implies unbounded positive integers were intentional while its title implies the opposite.

## Options

- Delete only the !== null clause, the drafted mutation-proven remedy
- Fold into the existing validator: halt on invalid, bound to 1..BUILD_AHEAD_CAP so the knob may only narrow the frontier
- Fold into the validator but leave no upper bound, honouring the commit body's implied intent
- Delete the override entirely, since it is undocumented, untested and has no emitter or caller

## Outcome

BOUNDED NARROW-ONLY, HALT OTHERWISE -- user ruling 2026-08-02. buildAheadCap folds into the existing validator at mitosis.js:3716-3755 in the retry.* shape: keep :3473, DELETE :3474-3477 entirely (the eager const, the guard, and the log with its clean(JSON.stringify(v)) double-encode), and add the check at :3752 before modelsKnobCheck, declaring buildAheadCap there. Safe because the only read is at :5050. The accepted range is 1..BUILD_AHEAD_CAP, so an operator may NARROW the frontier and never widen it -- this is what makes the commit title literally true, and it resolves the title-versus-body contradiction in favour of the title. mitosis.js only: buildAheadCap has no twin (repo-wide grep) and the remedy mutant passed mirror-guard, though buildAheadWindow IS a whole twin so any future read-site clamp would need both files. The double-encode needs no separate fix because it dies with the deleted clause. DELETING THE OVERRIDE WAS DECLINED as too large a reversal of a deliberate 777617b feature decision. Residual risk accepted knowingly: an out-of-repo caller passing null to mean 'no override' would now halt, and F3 could not measure callers outside this repo. Requires an acceptance test per invariant M3, red on the 777617b parent and green on the fix, asserting null, a non-integer, 0 and 9999 each halt.
