---
Status: accepted
Date: 2026-08-12T06:08:40.367Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0372. The process dispatches with claude -p subprocesses; StructuredOutput allowlists are a precondition

## Context

0369 named this the blocking question: how an OS process dispatches agents at all, since agent() and parallel() are Workflow hooks. Verified live against v2.1.228. The hook surface maps completely: opts.agentType to --agent (a bad name enumerated the real roster, so resolution is genuine), model to --model, effort to --effort, schema to --json-schema, isolation worktree to -w. agent()'s internal HTTP-transient retry is PRESERVED (system/api_retry), which removes it from the cost column. settings.json hooks and permissions.deny still fire. SIGTERM gives clean kill semantics at exit 143. Only opts.phase has no analogue and it is cosmetic - no control flow reads it.

## Options

- claude -p subprocesses - chosen: OS-level kill and isolation, hooks and deny rules intact, no SDK version coupling
- Agent SDK in-process - rejected: hooks move in-process, re-homing the security gates
- SDK with subprocess fallback - rejected: two code paths to keep in parity

## Outcome

Dispatch is claude -p subprocesses. Two facts the SPEC carries as hard requirements. First, a measured trap: --json-schema SILENTLY degrades to prose when the named agent has a restrictive tools frontmatter allowlist, because the agent cannot call StructuredOutput; it returns subtype success, is_error false, and no structured_output key. Every dispatchable agent needs StructuredOutput in its tools list, and the dispatch adapter must assert the key is present rather than trust subtype. Whether the current Workflow agent({schema, agentType}) path shares this trap is UNVERIFIED; if it does, schema enforcement is already void today on every allowlisted agent and that is a live defect, not a cutover item. Second, there is no --timeout flag, so the supervisor owns timeouts via SIGTERM.
