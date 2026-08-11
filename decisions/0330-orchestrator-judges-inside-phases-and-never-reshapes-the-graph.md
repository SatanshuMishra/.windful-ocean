---
Status: accepted
Date: 2026-08-11T05:56:19.174Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0330. The orchestrator judges inside phases and never reorders, skips or re-runs them

## Context

0326 settled that the toolkit must be the only reachable dispatch path, but left open how much the orchestrator may decide within it. The original architecture described an orchestrator holding the whole run history and deciding the next step. The enforcement research shows the SDK can make a dispatch path structurally exclusive - a PreToolUse hook deny runs on every tool call in every mode including bypassPermissions, and denying a tool by BARE NAME removes it from the model's visible tool list entirely rather than refusing it at call time. But it also shows why latitude is expensive: UnderSpecBench (arXiv:2607.02294) measured 55.8-67.8% of agent runs violating at least one operational boundary with explicit refusal at or below 2.5%, so a agent given room to reshape a run will use it wrongly and will not stop to ask.

## Options

- Judgment inside phases only, phase graph fixed by the toolkit - chosen
- May re-run a failed phase and halt, but not skip or reorder
- Full next-step authority over the phase graph

## Outcome

The phase sequence is fixed by the toolkit. The orchestrator MAY decide within a phase, halt, and ask the human; it MAY NOT reorder, skip or re-run phases. This keeps the blast radius of a boundary violation inside one phase and preserves what today's engine already gets right - its refusals are encoded as JS at mitosis.js:3991, :4213-4216, :4288-4290, :4739-4744 and :5169 rather than left to judgment. The gain over today is that those halts become live questions to a human instead of parks. Enforcement construction the SPEC must specify: one MCP dispatch verb with a rigid schema; the Agent tool and the shell denied BY BARE NAME, since the built-in general-purpose subagent is spawnable via the Agent tool with nothing defined; dontAsk mode so anything slipping past is denied rather than prompted; a PreToolUse hook mirroring the deny list as an independent second gate; CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH set explicitly, since the default permits worker-of-worker spawning; and bypassPermissions rejected at host startup, because it propagates to every subagent and cannot be overridden per subagent. Known gap carried forward: this repo's origin-agnostic Bash-text gate does NOT transfer to MCP calls, which have no text surface to match, so MCP denial stays an enumeration that a newly named tool escapes.
