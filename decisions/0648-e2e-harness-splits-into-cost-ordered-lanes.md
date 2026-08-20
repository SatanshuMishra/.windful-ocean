---
Status: accepted
Date: 2026-08-20T22:13:59.334Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0648. The end-to-end harness splits into cost-ordered lanes with live visibility, not one long blind wait

## Context

The harness had exactly one feedback signal - whether a built record existed in the journal - and that record cannot appear until the entire prep phase finishes, at roughly eight minutes per unit, planned sequentially. So it was structurally blind for the first half hour of every run. The first attempt waited twenty minutes and reported only that no built record appeared, while the engine was healthily writing plan documents throughout. The repair raised the ceiling to eighty minutes, and the user rejected that outright: a worst case of eighty minutes per debug round makes ten rounds thirteen hours before any fixing starts, and a bigger number makes the blindness longer rather than better.

## Options

- Keep one lane and raise the budget until healthy runs stop being killed
- Keep one lane and shorten the budget, accepting false aborts on healthy runs
- Split into cost-ordered lanes with streamed visibility and liveness-based aborts

## Outcome

Three lanes, cheapest first. Smoke costs nothing and takes seconds: it drives the real engine with dispatch stubbed through the injection seam the engine already exposes, and still crosses every phase, the ship composition, the pull-request argv against the real validator, the retarget emission, the lock conflict and resume. Single runs one live unit for the fastest honest proof of the billed path. Full is the four-unit measurement, worth triggering only once the cheap lanes are green. Across all lanes, an event is streamed the instant anything changes and a status file answers where the run is in one read; aborts fire on liveness rather than on budgets, so a dead engine stops the run immediately and a stalled child is named; and the declared criteria are evaluated incrementally, so a decidably violated criterion kills the run at that moment with its evidence rather than at the end. The smoke lane's green does NOT prove live behaviour and its runbook says so in those words - only its red is definitive, which is the half that makes a debug loop fast. Running it once immediately found four contract mismatches and an engine-side park that writes no journal record at all.
