---
Status: accepted
Date: 2026-08-11T23:53:43.782Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0355. The window-fill question is answered at the artifact layer, not the context layer

## Context

With rotation out of scope after 0352, harness auto-compaction becomes an undesigned summarizer acting on exactly the constraints 0343 forbids dropping without a marker, and 0342's four tiers were designed for a supervisor that no longer exists. Designing a marker mechanism around auto-compaction would re-import the whole rotation problem the cut was meant to remove.

## Options

- Make the main thread's context disposable and hold state in artifacts - chosen
- Design a main-thread rotation with a fill sensor
- Accept auto-compaction silently

## Outcome

Answered at the artifact layer. 0342's Tier 0 and Tier 1 are re-aimed at the main thread: externally visible state is RE-DERIVED from git and GitHub at resume rather than carried, and constraints, decisions and failures are re-pinned VERBATIM into every dispatch prompt rather than trusted to survive in context. Nothing load-bearing then lives only in the main thread's window, so auto-compaction cannot drop it and 0343 is satisfied without any marker mechanism - the run journal is the memory and the context is disposable. One operator-facing number still belongs in the SPEC: the fill level at which a run hands off rather than continues.
