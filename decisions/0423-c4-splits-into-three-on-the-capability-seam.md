---
Status: accepted
Date: 2026-08-14T16:22:37.357Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0423. C4 splits into C4a, C4b and C4c on the capability seam

## Context

C4 converts the eighteen shell-out-and-transcribe dispatches and is one of the largest remaining units. Run 3's verified C4 plan found the eighteen sites split cleanly on a capability seam. Decision 0374's eighteen-MSP decomposition is not open for an agent to re-litigate, so the split needed the user's ruling. The user was asked directly and chose to split.

## Options

- Keep C4 as one MSP per 0374 - rejected by the user: one PR far past the review-size target, in the same oversize class as C7
- Split into C4a, C4b and C4c on the capability seam - chosen by the user
- Delegate granularity to the orchestrator per MSP - rejected by the user: decomposition stays a human ruling

## Outcome

C4 ships as three stacked MSPs, C4a, C4b and C4c, divided on the capability seam the plan identified. Each keeps near the 200-400 LOC review target instead of one oversize PR. This amends 0374's decomposition by two additional units; every other constraint 0374 set still binds, and C7 remains the only SPEC-named unsplittable MSP.
