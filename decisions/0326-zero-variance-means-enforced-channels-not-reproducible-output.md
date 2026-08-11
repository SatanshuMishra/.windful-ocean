---
Status: accepted
Date: 2026-08-11T05:32:41.075Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0326. Zero variance means instructions are binding, not that model output is reproducible

## Context

Asked to reconcile "ZERO room for variance from run to run" with an orchestrator agent that decides the next step, the agent researched output determinism and reported the two as structurally incompatible - LLM inference is not bit-reproducible even at temperature 0 because output depends on server-side batch composition, and sampling a next-step choice is not a function. The user corrected this: variance does NOT mean Claude giving an identical response to the same question. It means Claude must not treat instructions as suggestions. The named example is the PR path - a centralized tool plus hooks plus permissions.deny make the structure impossible to bypass rather than merely requested.

## Options

- Enforced channels: the toolkit is the only reachable dispatch path, alternatives denied at the gate - chosen
- Output determinism via constrained decoding and a closed action enum - answers a question that was not asked
- Open orchestration with the toolkit as a convention

## Outcome

The requirement is an enforcement-architecture problem, not a determinism problem. The orchestrator must be structurally unable to dispatch outside the mitosis toolkit - no ad-hoc agent spawn, no custom dispatch, no bypass - enforced the way pull-requests.md enforces pr-create: one centralized verb, every alternative denied at the bash gate and in permissions.deny, origin-agnostic so it needs no per-tool maintenance. The determinism research remains valid but is NOT load-bearing for this SPEC and must not be cited as a constraint on agent-owned control flow. Re-ask on orchestrator authority is still open with this corrected framing.
