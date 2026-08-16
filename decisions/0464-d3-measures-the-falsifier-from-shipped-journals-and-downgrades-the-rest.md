---
Status: accepted
Date: 2026-08-16T06:47:19.071Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0464. D3 measures the binding falsifier from shipped journals and downgrades the cost claims honestly

## Context

D3's SPEC text at :565 says to publish from A1's envelope — dispatches per shipped MSP, input and output tokens, cache creation versus cache read, and total_cost_usd — "plus the aggregation in run-store". That aggregation does not exist: a grep for total_cost_usd, cache_creation and cache_read across .claude/lib/mitosis/*.mjs returns nothing. No pre-move baseline is recorded under .claude/reports/ either; the nearest artifact is a 2026-07-17 token-cost audit written before the move. So D3 as specified reads an instrument that was never built and compares against a baseline that was never captured. The binding criterion is narrower than the full envelope: the falsifier at :567 is a run exceeding 10 dispatches per shipped MSP, which is a dispatch COUNT, and this stack has already shipped roughly eighteen MSPs whose journals are real historical data. The SPEC caveat at :571 also requires cold and warm cache to be reported separately, because prompt caching is content-keyed and a repeat payload reads warm across processes.

## Options

- Execute a live measured mitosis run overnight to capture fresh envelopes
- Build the aggregation and the report scaffold and defer all measurement
- Build the aggregation, then evaluate the falsifier against the journals the stack already produced

## Outcome

Build the run-store envelope aggregation, then evaluate the binding falsifier against the real journals of the MSPs this stack already shipped. That measures the one criterion the release gate turns on, at zero new spend and on genuine data rather than a synthetic run. Token, cost and cold-versus-warm cache figures are reported only where an envelope was actually captured; everywhere else they take an explicit unverified-reasoned downgrade rather than a fabricated number. No live measured run is executed unattended, since a run that fails overnight has nobody to unblock it and the spend is unbounded. Every cost claim published must still be paired with a fixed quality assertion, because the instrument counts tokens and cannot see whether a re-architected decomposition cuts worse.
