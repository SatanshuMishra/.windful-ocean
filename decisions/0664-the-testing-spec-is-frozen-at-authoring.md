---
Status: accepted
Date: 2026-08-21T18:13:51.388Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0664. The testing-architecture SPEC is frozen: implement and ship it in full before proposing anything else

## Context

The prior pattern was one terminal defect per billed run, each fix spawning a follow-up, with scope growing faster than it closed. The user ruled that the authored SPEC is the complete definition of the work and that the failure mode to avoid is not an unfixed defect but an ever-widening plan. A fresh session will implement it with dedicated dispatched agents, so the directive has to travel in the ledger rather than in a conversation the fresh session cannot read.

## Options

- Freeze the SPEC: implement all eight MSPs as written, file nothing new until every one has shipped, and use stacked pull requests to keep moving past a blocked MSP
- Let each MSP's findings feed back into the SPEC as they arrive, which is what produced the widening loop the SPEC exists to end
- Implement only the MSPs that look load-bearing and defer the rest, which leaves the suite half-predictive and the green signal still untrustworthy

## Outcome

The SPEC is frozen at its authored content. No edits, no scope increase, no reordering, no substitutions. All eight MSPs are implemented and shipped in full. No follow-up work is proposed until the entire SPEC has shipped; anything discovered along the way is noted and held, not acted on. Where an MSP blocks, the next MSP proceeds on a stacked pull request rather than the work stopping. Parent branches are deleted only after every child has been retargeted and the retarget confirmed.
