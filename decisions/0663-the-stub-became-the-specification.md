---
Status: accepted
Date: 2026-08-21T18:08:09.829Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0663. The always-succeeding stub became the specification, so a green suite says nothing about live

## Context

Four billed runs on 2026-08-21 each surfaced exactly one terminal defect. All five defects found are explained by one cause: every automated test of mitosis as a whole replaces the model with a stub that always succeeds, instantly, and does nothing. The smoke stub is 123 lines and its entire verdict vocabulary is approve, pass and a canned implement success; its only failure path fires when the stub cannot parse, never because a model decided something. Because the stub cannot produce a failing input, missing engine code and missing coverage became indistinguishable, and the engine was written to satisfy the stub. A separate constraint was measured while specifying the fix: recordUsage persists only cost and tokens, so what a model actually returned is never written to disk and no cassette can be harvested from any past run.

## Options

- Author a SPEC that makes the free lane able to express failure, then delete the tests that assert composition against monotone stubs
- Keep discovering defects through billed runs, one terminal fault per run at roughly five dollars and seventeen minutes each, with an unknown number remaining
- Add more unit tests against the existing suite, which cannot reach seam defects because a unit test asserts one thing in isolation

## Outcome

A SPEC was authored at m15/TESTING-ARCHITECTURE-SPEC.md, eight MSPs, for implementation in a fresh session. It buys one property: a green suite implies mitosis is expected to work live. Four of the five defects become free regression tests. The billed run is demoted from discovery instrument to confirmation instrument and to the only source of recorded cassettes. Self-review corrected four claims that would otherwise have forced a rewrite, including an invented dispatch-kind enum that is now marked derive-before-implementing rather than asserted.
