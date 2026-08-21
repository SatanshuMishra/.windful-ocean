---
Status: accepted
Date: 2026-08-21T01:36:29.713Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0652. Planning stays sequential; the run signals life early instead

## Context

Prep runs every unit's planning sequentially before the first journal byte exists (unit-planning.mjs:352-359, called from phase-driver.mjs:207-228, ahead of engine.mjs's writeGenesis). Measured on the prior live run: 14m45s of total silence, with one measurable unit taking 244s - the inherited "eight minutes per unit" figure is unverified. A healthy run is indistinguishable from a hung one for its first quarter hour. The sequencing proved incidental rather than essential: no prep step reads another unit's output, plan paths are keyed by unitId, and the journal, run store and checkpoint refs are all untouched during Prep. Execute already runs up to eight children concurrently (pool.mjs:302-318), so the dispatch layer supports it. The decisive counter-evidence is that the run this analysis came from died on two HTTP 429s, and four concurrent plan children multiply exactly that pressure.

## Options

- Full concurrency: Promise.all over the planning loop, about ten lines, fastest, but four times the rate-limit pressure that just killed a run
- Bounded concurrency at two: halves planning wall time, roughly doubles peak request rate, needs an outcomes-array order fix and ships uncovered since planUnits has no tests
- Early journal genesis only: move writeGenesis to the start of Prep using the manifest already in hand, about fifteen lines, no rate-limit interaction, does not shorten the run
- Keep sequential with no change: accept the silence

## Outcome

User ruled: early journal genesis only. Shipped as PR #261 (a677b001) - phase-driver.mjs gains writeGenesis in REQUIRED_PORTS and calls it as prepPhase's first action, reusing the manifest Resume already produced, so no clock is read and determinism-lint stays green. Bounded concurrency is deliberately NOT taken while rate limits are live; it may be reconsidered once a billed run completes without a 429. The implementation trap, recorded because it defeats the obvious approach: every "at" the engine writes is request.at, the run-start instant, so a progress signal built on journal "at" values reports nothing and needs a caller-supplied per-event instant.
