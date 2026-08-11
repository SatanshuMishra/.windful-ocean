---
Status: accepted
Date: 2026-08-11T22:59:55.148Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0351. The fresh-session title tax is a real per-spawn charge to model, not an accounting artifact

## Context

T1 and T2 billed $0.0783058 and $0.0074818 for an identical 70,368-token cache read. The gap had to be explained before any cache-read or session-creation price could enter the SPEC, because the SPEC's decomposition and rotation arguments both rest on what a spawn costs.

## Options

- Treat T1 as an SDK accounting artifact - the aggregator folding cache-read tokens into inputTokens and pricing them twice - and discount it to ~$0.0075
- Treat it as a real charge from a second, undisclosed API request and model it as a per-spawn tax
- Sidestep the question by quoting the turn's API usage block alone and ignoring costUSD

## Outcome

The charge is real; option 1 was my own first reading and is refuted. A fresh session issues a second request that auto-generates a session title by re-sending the entire first user message uncached at full input price - $0.0707990 of T1's $0.0783058, or 90.4% of the turn. The aggregator and price function keep input and cache-read tokens strictly separate, so there is no double-count; an ai-title transcript entry present on T1 and absent on T2 confirms the second request. The guard skips it when restored history holds a non-system message, so resume never pays it and fresh spawns always do. Therefore: the SPEC models a per-spawn title tax proportional to each spawn's first prompt, and totalCostUsd is the cost of truth - the turn's API usage block omits the second request entirely and under-reports a fresh turn by about tenfold. This is an argument for resume-based session reuse that is independent of context-fill, and it compounds with the content-keyed prefix cache, since a warm main turn still pays a cold title. Option 3 is rejected as the specific mistake that would have hidden this. The title request's usage is derived arithmetically rather than observed (only one requestId per turn is transcribed), over-determined by two independent routes; CLAUDE_CODE_DISABLE_TERMINAL_TITLE as a suppressor is read from the binary but untested.
