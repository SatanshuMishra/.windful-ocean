---
Status: accepted
Date: 2026-08-18T18:26:25.485Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0578. The remaining stack ships by lead-agent fan-out, gated on one architecture decision

## Context

The 0573 audit closed at 0576 with thirteen named root causes across two families, and the judgment half - fragility, complexity, simplification, best-practice departures - was deliberately left undone. Four criteria remain (c28 through c31) and every one of them is downstream of how the thirteen root causes get fixed: c29 and c30 literally assert the behaviours that RC1, RC2, RC3 and RC6a would change, and c31 cannot be written until the E2E substrate defect at e2e-substrate.mjs:479-497 is settled. The user approved the next step and directed that the work be orchestrated from the main thread through dedicated LEAD agents that themselves dispatch maker agents, fanning out for speed.

## Options

- Fan out delivery leads immediately across the four remaining criteria in parallel, accepting that each lead settles its own share of the design
- Dispatch one architect lead for the judgment half and the single whole solution, declare acceptance ceilings from its output, then fan out delivery leads per parallel group
- Skip the judgment half and implement the two reports' candidate remedy lists directly as a menu of fixes

## Outcome

Chose the gated fan-out. One architect lead runs first, alone on the critical path, producing the simplification and architecture verdict, ONE whole solution covering all thirteen root causes, and an MSP decomposition whose acceptance ceiling is declared per unit before any implementation begins - which is G0, and which the thread has twice been burned by skipping. Its MSP parallel groups become the orchestrator's fan-out map, so lead-agent fan-out is the delivery mechanism for every unit but never the mechanism that settles the design. The architect fans out its own read-only workers under a hard cap of eight, writes no production code, and is barred from re-auditing or re-running the engine. Rejected the immediate four-way fan-out because parallel leads settling overlapping design questions is the reviewer-loop failure 0573 was filed to stop; rejected the candidate-menu path because the reports name their remedy lists as input for a decision, not as a decision.
