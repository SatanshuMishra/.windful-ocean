---
Status: accepted
Date: 2026-08-18T01:52:40.310Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0552. The chapter 9 recommendations and the findings the fixes surfaced become the successor backlog, worst first

## Context

The six audit fixes landed on feat/mitosis-ship-live. The user directed that the audit's chapter 9 recommendations be recorded as successor tasks following the fixes rather than folded into them. Implementation also surfaced findings the audit never named, one of them larger than anything in the original six.

## Options

- Fold the recommendations and new findings into the current fix stack
- Record them as a ranked successor backlog and keep the shipped stack at its declared ceiling
- Defer recording until the stack merges

## Outcome

Recorded as a ranked successor backlog; the fix stack stays at its declared ceiling. Ranked worst first. (1) THE DIVERGENCE PROBE IS UNIMPLEMENTED: divergence.mjs destructures agent, divergenceCheckPrompt and DIVERGENCE_CHECK_SCHEMA from its ctx and none of the three exists anywhere in the tree, so every keyed parent throws, is caught, and folds closed. A dependency chain structurally cannot resume, and wiring mergedShas provably cannot fix it - measured, the map changes nothing observable while the probe is unwired. Needs either a registered prompt kind plus schema or a deterministic git diff port; both are a second adjudication surface inside a fail-closed guard. (2) Connectivity census from the entry point, ranked by the audit above any individual fix: the defining defect class is defined-but-unreachable code and no gate detects it. (3) A real unit verdict measurement, so a pull request can carry a true verified line again: needs a host-executed scoped check, since the child schema forbids extra fields and the host never spawns the check today. (4) Cross-vocabulary census over fourteen hand-maintained status vocabularies with five live disagreements, every one found so far a real defect. (5) A shipped-but-unmerged unit is re-dispatched from scratch on the next invocation. (6) The residual green field is now permanently false and unread, dead state left in place deliberately. (7) force-with-lease is unusable when the head has no remote-tracking ref, so the leased retry is dead in a fresh clone; the failure is an honest park. (8) Two transcription departures want real verbs: ship/retire-head and ship/merged-into-trunk. (9) The hardcoded real-gh fallback in resolveRealGh and resolveGhBinary means naively deleting a gh double makes tests reach real GitHub - the trap that forced the in-process runner. (10) Reconsider the determinism gate's cost, which bought reproducibility at the price of the engine being unable to observe its own speed.
