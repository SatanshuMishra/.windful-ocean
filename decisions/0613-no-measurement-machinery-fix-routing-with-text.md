---
Status: accepted
Date: 2026-08-19T02:30:06.982Z
Thread-Id: 01M0BV3M8GKVP5HSQKB19Z9WW8
---

# 0613. Drop the routing measurement entirely: fix triggering with agent description text, not machinery

## Context

A Lead had been dispatched to build three tree-based routing signals - orchestration yield, re-entry concentration, unorchestrated main-thread work - to quantify over and under-triggering. The user stopped it mid-flight and ruled against the whole approach, rejecting complex hooks, prompt regex and layered checks by name, and accepting that agent dispatch is non-deterministic and called on need.

## Options

- Build the three signals and quantify over and under-triggering
- Drop the measurement and change the agent description text instead
- Do both in parallel

## Outcome

DROP the measurement. The reasoning that survives scrutiny: the routing decision happens inside the model reading an agent's description field, so machinery wrapped around it cannot reach where the decision is made - it can only block after the fact and would misfire on legitimate cases. The observed architect failure needs no quantification to act on, because it is not a triggering defect at all: each dispatch was individually reasonable, and what was missing was any signal that the design question had CLOSED, so every re-invocation legitimately grew scope. That is a stopping condition, and decision 0468 already solved the identical shape for review loops by closing the reviewer's question rather than capping rounds. The fix is therefore sentences in files that already exist - a stopping condition on architect, and an explicit when-NOT-to-use clause on each Lead - carrying no hooks, counters, budgets, validators or gates. Standing constraint from this ruling: propose no dispatch-counting hook, pre-dispatch validator or Lead budget in future rounds.
