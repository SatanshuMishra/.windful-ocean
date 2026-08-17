---
Status: accepted
Date: 2026-08-17T05:05:36.528Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0502. The end-to-end substrate is built early, not last

## Context

The design put the disposable substrate last, as the vehicle for c31's end-to-end test. But c29 and c30 both demand a REAL RUN rather than a unit test, and 0494 recorded that the thread's whole failure was accepting stubbed evidence: the single end-to-end proof was one manual run of two trivial units against a stubbed dispatch. Every MSP between the phase driver and the end-to-end test would otherwise pin its acceptance against the same stubbed harness that produced that false confidence. The substrate itself is test-only and touches no production file: a stub claude executable on PATH per the A1 test seam, a fake gh recording argv, and a local bare git remote. The pattern is already proven at .claude/lib/git/tests/pr.test.mjs:685-707, and tests/ is excluded from the determinism census.

## Options

- Keep the substrate last as the vehicle for c31 alone
- Build the substrate immediately after the phase driver so every later MSP proves itself on a real run
- Build the substrate in parallel with the phase driver, off the same base

## Outcome

The substrate lands immediately after the phase driver, as its own test-only MSP, and every MSP after it pins its acceptance against a real run through that substrate rather than against a stubbed dispatch. This costs one extra MSP slot and buys the thing 0494 said was missing. The parallel option was REJECTED despite being genuinely conflict-free on files: it would fork the stack into a diamond, and a later MSP would then have an ambiguous pull request base. The stack stays strictly linear so the human merge order stays a single bottom-up line, which is also the shape that avoids the retarget-only-on-base-deletion trap. Speed loses to that deliberately, under the pillar order.
