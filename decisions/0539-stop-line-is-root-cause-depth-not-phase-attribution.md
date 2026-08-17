---
Status: accepted
Date: 2026-08-17T17:36:22.413Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0539. The e2e stops at root-cause depth and a live-usability verdict, not at phase-level failure attribution

## Context

The user redefined the completion bar mid-run. Reporting that mitosis stopped or failed at a named phase is explicitly insufficient. What is required is the true source of each failure: which mechanism inside the phase caused it, what contributing factors existed, and whether earlier phases fed the later ones bad information. The purpose is twofold, to decide whether mitosis would work if used live today, and if not to locate the failure points and judge whether the cause is architectural complexity and fragility or a small localized bug. The user also directed that the fourteen-MSP scale probe be skipped for now and revisited as secondary testing, and that the probes already in flight run to completion.

## Options

- Report findings per phase with reproductions, which is the original acceptance
- Extend to causal root-cause analysis with a bug-versus-architecture classification and a live-usability verdict
- Fix the defects found and re-run until a live run succeeds end to end

## Outcome

Extend to causal analysis and a verdict, and do not fix. The deliverable becomes, per confirmed failure, the precise mechanism with citations, the upstream inputs that contributed, a classification as localized bug or architectural fragility, and the minimum change set that would make a live decompose-to-pull-request run succeed. Fixing stays out of scope because the acceptance ceiling for this work is a test and a defect found above it is filed as a new item. The scale probe is deferred by explicit instruction. Structural fragility is to be judged on evidence rather than impression, including how much state passes between phases as stale snapshots and how many parallel status vocabularies must be kept consistent by hand.
