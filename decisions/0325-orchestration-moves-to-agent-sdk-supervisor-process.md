---
Status: accepted
Date: 2026-08-11T05:32:31.268Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0325. Orchestration leaves the Workflow sandbox for an Agent SDK supervisor process

## Context

SPEC B section 7 ruled out leaving the Workflow runtime because doing so "would forfeit agent() - the only effector available". That premise is false: the Claude Agent SDK is a first-party effector running in real Node. Three independently blocking harness facts force the move anyway. (1) A Workflow cannot ask a human mid-run - documented at code.claude.com/docs/en/workflows: "No mid-run user input... Only agent permission prompts can pause a run", and workflow resume is same-session-only. (2) Nothing inside Claude Code can read a spawned subagent's context fill, so a rotation trigger has no sensor; only an SDK host sees ResultMessage.usage. (3) Subagent nesting is capped at 3 layers below main (CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH), which main->orchestrator->phase->worker exhausts; an OS-process supervisor resets the count. All three share one cause: the Workflow sandbox is the wrong host for an orchestrator.

## Options

- Agent SDK supervisor process - chosen
- Stay in the Workflow sandbox and keep Part III codegen as the only path off the twinning tax
- Hybrid: SDK supervisor for orchestration, Workflow tool retained for fan-out waves

## Outcome

Orchestration moves into a Node process hosting the Claude Agent SDK. Consequence that must not be lost: mitosis.js is 5,515 lines carrying ~25 verbatim inline module twins for exactly one reason - the sandbox forbids import. A real Node host restores ESM, so SPEC B Part III (codegen decomposition, the generator, the byte-identity proof, the mirror-guard role change) becomes MOOT rather than solved, and is dropped rather than implemented. Language is Node/TypeScript, not Python: the TS SDK bundles the Claude Code binary where Python requires it on PATH, Python trailed TS on hook streaming, auto permission mode, session stores and sandbox network config, and Node's --permission model is Stable where Python's equivalent was withdrawn (PEP 551) and never shipped (PEP 578 is auditing, not sandboxing). Costs accepted: loses the /workflows progress UI and harness-native resume, which the supervisor must now provide itself.
