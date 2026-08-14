---
Status: accepted
Date: 2026-08-14T20:40:56.695Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0428. A verified plan's claims are still claims and get re-checked at implementation

## Context

Every MSP on this stack hit the same trap: a stated fact that was true paired with a conclusion that was false. It was assumed this applied only to the SPEC. C4b then found five further errors inside plans/C4-plan.md, a plan that had itself been produced and verified by an earlier run, including plan-probe's command and manifest-publish's spawn count.

## Options

- Trust a plan that a prior run verified - rejected: C4b found five errors in exactly such a plan
- Re-verify every load-bearing plan claim against a running command at implementation time - chosen
- Re-plan each MSP from scratch at implementation - rejected: discards work that is mostly sound and is far more expensive than spot re-verification

## Outcome

A banked plan is a starting point, not an authority. Every load-bearing claim in it is re-checked against a running command at implementation time, exactly as SPEC claims are. Each banked plan therefore opens with a Task 0 re-baseline, both because heads move and because the plan's own assertions may be wrong. Verification does not transfer across time or across the artifact boundary.
