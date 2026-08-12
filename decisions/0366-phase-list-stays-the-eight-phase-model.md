---
Status: accepted
Date: 2026-08-12T04:18:27.104Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0366. The phase list stays the re-adopted eight-phase model, not the directive's five-step sketch

## Context

The 2026-08-11 directive's flow reads decompose, cluster, plan per cluster, implement, then a trailing "5. ...". The last session read that trailing step as a gap and assumed review, then integrate, then ship, flagging it as the open question that gated the SPEC's phase list.

## Options

- Treat the directive's list as the phase model and ask the user to supply step 5
- Keep the eight-phase model re-adopted in 0338 and read the directive's list as an illustration of one point

## Outcome

The directive's list was never meant to be all-inclusive, so there is no missing step 5 to supply. It illustrated exactly one point: nothing before the implementer phase has a legitimate reason to touch the codebase, for audits or anything else. The SPEC's phase list stays the seven-or-eight-phase model re-adopted in 0338, re-derived against today's engine. The rework's target is to cut the pre-implementer audits, reviews and censuses that exist only because the output of earlier phases was not trusted.
