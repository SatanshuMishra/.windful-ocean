---
Status: accepted
Date: 2026-08-21T06:15:15.636Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0661. A unit gets three plan revisions, not one, because one revision does not converge in practice

## Context

Three consecutive live runs each needed at least one plan revision before the review stage approved, and the third was still unapproved after its single allowed revision, so the engine parked the unit with plan-unapproved and the run never reached Ship. The review was doing real work in every case - on the third run it caught that the plan's own receipt used a stash after committing, which would have recorded a false green. At roughly even odds of converging per unit, a four-unit lane clearing all four units is unlikely, so the full lane could not complete at the old setting and the every-declared-unit-ships criterion was unreachable.

## Options

- Leave the budget at one and treat parking on an unapproved plan as correct, changing what the end-to-end test asserts instead - cheapest per run, but the shipping criterion becomes unreachable
- Raise the budget to two, the minimum that would have cleared the third run - leaves no margin, since that run consumed the second revision itself
- Raise the budget to three - a unit converges or parks with margin, and the extra dispatch pairs are only spent on units that actually need them
- Make the budget configurable per run with a default of three - more engine surface and a larger change than the evidence yet justifies

## Outcome

Raised to three. The extra cost is paid only by units that fail review, and the observed data shows one revision is below what a real plan-and-review pair needs to settle. Configurability is deliberately not added: nothing yet needs to vary it per run, and the constant plus its pinning test is the smaller change. The test asserting the budget equals one is updated in the same change rather than deleted, so the value stays pinned to an exact number.
