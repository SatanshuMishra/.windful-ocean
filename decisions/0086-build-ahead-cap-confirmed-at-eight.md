---
Status: accepted
Date: 2026-07-28T20:00:53.431Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0086. Confirm BUILD_AHEAD_CAP = 8, the AIMD controller's existing ceiling

## Context

Spec §13 open ask (b), gating M4. §3.3 deletes the AIMD window controller because its signal was incoherent, not because a constant is proven better: it re-counts a persistent APPROVED on every poll cycle with no dedup, inflating 3 to 8 from a single approval, while the shepherd path dedups exactly that. A control law that disagrees with itself is worse than a constant. Nobody ever instrumented how often divergent invalidation fires, so the cost of a deep-chain rebuild burst is unknown.

## Options

- Confirm 8, which is today's WINDOW_CEILING and therefore not a new number
- Pick a lower value and gather instrumentation first
- Keep an adaptive controller with a corrected, deduplicated signal

## Outcome

Confirmed at 8. It is the ceiling the existing tuner could already reach, so this changes no observed behavior at the top of the range and introduces no unvalidated number; an engine-arg override remains available. Taken on the user's 2026-07-28 instruction to proceed as recommended. The instrumentation debt is NOT discharged by this: M4 still owes the per-run divergence count and rebuild-unit count required by §3.3 and §11, and if that number proves material then K becomes an adaptive question again, with data next time.
