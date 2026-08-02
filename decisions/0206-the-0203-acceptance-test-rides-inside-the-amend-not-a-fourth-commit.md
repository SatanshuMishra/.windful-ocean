---
Status: accepted
Date: 2026-08-02T17:14:51.838Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0206. 0203's mandated acceptance test lands inside the amended commit, because a behaviour change and the test that pins it are one atomic change

## Context

0203 requires an acceptance test per invariant M3, red on the 777617b parent and green on the fix, asserting that null, a non-integer, 0 and 9999 each halt. 0204 separately enumerates exactly what the amend carries -- 'the buildAheadCap validator move plus a corrected commit message' -- and names exactly three follow-up atomic commits: F1's restored e2e test, F4's clamp cleanup, F2's coverage file. Neither ruling says where 0203's own test goes, and the two readings are not equivalent: folding it into the amend makes the amend carry a test, while splitting it out would make a fourth commit that 0204's enumeration does not list. The project's commit rule forbids mixing a behaviour change with a refactor or an unrelated test restoration, which is the rule 0204 invoked. The user's authorization was explicitly for THAT sequence and not a variant, so an implementer guessing silently was not acceptable.

## Options

- Land the acceptance test inside the amend alongside the validator move
- Land it as a fourth separate atomic commit on the same branch, after the amend
- Defer the test and ship the validator change with the receipt recorded only in the coverage artifact

## Outcome

INSIDE THE AMEND. A behaviour change and the test that pins that same behaviour are ONE logical change under the project's own atomic-commit rule -- the rule forbids mixing a behaviour change with an UNRELATED refactor or test restoration, which is precisely why F1's foreign-branch test and F4's cleanup were split out and this one was not. 0204's three-commit enumeration is about the three unrelated remedies that collided on one branch; it did not contemplate 0203's test, which did not exist as a separate artifact when 0204 was written. Deferring was rejected outright: 0203 states the test as a requirement, and a receipt recorded only in prose is the fabricated-test-plan failure the honesty rule exists to prevent. Executed as ruled: E10 landed in the amended 68ee1bb, was RED on the pre-amend tree and GREEN after, and the pre-amend probe measured the frontier widening to 12 units against a cap of 8. This is a resolution of an ambiguity the authorized sequence left open, not a deviation from it, so it needed no re-confirmation -- but it is recorded so the next session does not read the amend's contents as scope drift.
