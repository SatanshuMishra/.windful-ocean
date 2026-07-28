---
Status: accepted
Date: 2026-07-28T20:00:47.320Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0085. Authorize the M0 resumePoint one-line fix as a standalone atomic commit

## Context

Spec §13 open ask (a), gating M0 only. §9 documents a live four-step defect: applyBuiltTransition spreads the prior msp and never clears resumePoint, so a unit parked at stage 'plan' and later rebuilt retains stage 'plan'; an ancestor park then preserves that field rather than nulling it, and the relaunch guard (status parked AND resumePoint.stage plan) returns early, skipping the git-ref rescue and re-executing a unit that has a live checkpoint ref. Root cause is a transition that fails to invalidate a field meaningful only in the prior state. Frequency is unknown because divergent invalidation was never instrumented.

## Options

- Authorize it now as its own atomic commit, independent of the redesign
- Defer it and let M2's derived-resumePoint change subsume it by construction
- Leave it unauthorized pending instrumentation of how often divergent invalidation actually fires

## Outcome

Authorized as a standalone atomic commit, separable from the redesign, starting with a red test reproducing the four-step sequence in §9 per spec §11. Taken on the user's 2026-07-28 instruction to proceed as recommended. Note it does not become redundant under M2: M2 makes resumePoint derived rather than carried, which removes the defect class by construction, but M0 is authorized to land first and independently so the live bug is fixed regardless of when the redesign lands. Sequencing caveat: M0 still sits behind the hermeticity blocker, since its red-then-green proof needs a trustworthy suite signal.
