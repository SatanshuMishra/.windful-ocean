---
Status: accepted
Date: 2026-08-17T15:23:46.406Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0521. The e2e proof runs live against a disposable GitHub repo, not on the fakebin substrate

## Context

c28-c31 each demand a real engine run. The shipped harness e2e-substrate.mjs already drives real cli.mjs and decompose-emit.mjs subprocesses against a real bare-git remote, but it puts fake claude and fake gh binaries on PATH. Those two fakes are exactly the boundary the remaining criteria sit on: no shipped test has ever exercised a live model dispatch or reached github.com, so decomposition quality, wall-clock, token cost and real PR behaviour are all unmeasured. The user asked directly whether the engine is fast and token-efficient, which no fake-child run can answer at all.

## Options

- Extend the existing fakebin substrate only - cheap and deterministic, but structurally cannot answer cost, speed or real-PR questions
- Run live against a real disposable GitHub repo with real claude children - answers the open criteria, costs real tokens and real wall-clock
- Both, split by what each can actually observe

## Outcome

Both, split by observability. A live track runs the engine against a private disposable repo SatanshuMishra/mitosis-e2e-substrate with real gh and real claude children, and owns everything the fakes cannot see: decomposition correctness and variance, achieved concurrency, model output quality, real PRs, wall-clock and token cost. The fakebin substrate keeps the deterministic fault-injection matrix where inducing a real fault reliably is impractical. Acceptance is pinned before the runs: three SPECs each ship a sibling expectations file predicting MSP count, dependsOn, fileScope and concurrency, written from the SPEC text and never adjusted afterwards to match what the engine produced.
