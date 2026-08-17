---
Status: accepted
Date: 2026-08-17T15:39:47.770Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0523. Speed and concurrency are measured by an external PATH shim, because the engine records no per-event time

## Context

Building the observability harness established that no mitosis artifact carries a per-event clock read. phase-driver.mjs:219 builds the observer with the single --at value parsed once in cli.mjs, and cli.mjs:337-341 hands that same constant to the unit, state and usage recorders, so usage.jsonl observedAt, items out at, and state.json at are one identical string for every unit. recordOutput fully replaces the record at run-store.mjs:288-296, destroying the only start marker, and run-log.mjs:5-33 gives built, park and ci-attempt no time field. The cause is structural rather than an oversight: the determinism gate forbids clock reads in engine source except through argv, so the engine takes one validated instant and stamps everything with it. The pool sequence counter gives a genuine interleaving ORDER but is not a clock and is also dropped on settle.

## Options

- Infer concurrency from settle times in usage.jsonl - impossible here, they are all one constant
- Add a clock read to the engine so it can time itself - would redden the determinism gate and is a code change outside a test's remit
- Instrument externally with a transparent passthrough shim on PATH and leave the engine untouched

## Outcome

Measure from outside. dispatch.mjs:8 spawns bare claude with shell false, so PATH resolution is a live seam a transparent passthrough shim can occupy without touching engine source. The shim records a start and an end line per child with high-resolution timestamps and correlates them by id, which also makes a torn-down run measurable. The observability harness keeps reporting method none over engine artifacts rather than inventing a number, and the shim log becomes the sole concurrency and duration evidence. The engine's inability to report its own speed is itself recorded as a finding, not worked around silently.
