---
Status: accepted
Date: 2026-08-12T06:08:24.905Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0370. The engine leaves the Workflow sandbox; fanout's thesis is adopted, its topology is not

## Context

fanout was read in full (1,929 lines, 2 commits). Its primary mode is the INVERSION: the model calls fanout as a calculator and dispatches with its own primitive, and its Claude Code adapter names the Workflow tool's pipeline()/parallel() as the preferred dispatcher (adapters/claude-code/SKILL.md:196-199); --exec is the documented fallback for an agent runtime with no subagent primitive (:50-52). fanout is therefore NOT evidence for moving a loop out of a sandbox. Its transferable thesis is narrower and stronger: no sampler in the deterministic path. Applied to mitosis that thesis still forces the move, because mitosis's loop is already code and the disease is one layer down: 24 of 38 dispatch construction sites (~63%) exist only because the sandbox has no fs/exec. Five write bytes the engine already holds and interpolates into the prompt (mitosis.js:4269). Two are programs written in English (parallelize :4892-4908, boundary :1508-1530).

## Options

- Stay in the sandbox and pursue the section 14 toolbox, prose recipe to typed verb - rejected: a typed verb still costs a dispatch, and the five b1 sites return zero information
- Full OS process owning the loop, reaching a model only at the 9 judgment kinds - chosen
- Hybrid: process runs to the next decision point and returns to the main thread - rejected as unnecessary once claude -p proved a real effector
- Keep the monolith unchanged

## Outcome

The control loop moves to a deterministic Node process with no context window and no model, reaching a model only at the 9 judgment kinds. This SUPERSEDES 0353, whose premise (leaving Workflow forfeits agent(), the only effector) is refuted on the facts. It does NOT reopen 0352: what 0352 cut was an LLM host owning rotation and auto-compaction; a calculator has no context to rotate. They share a word, not a design. Two structural guarantees downgrade to policy and must be replaced structurally: non-determinism (Date and Math.random are denial Proxies, workflow-sandbox.mjs:39-46) and inability to merge (no exec at all). Side effect that closes 0359: claude -p --output-format json returns usage, cache tokens and total_cost_usd per dispatch, and the supervisor composes the prompt, so the instrument section 8 called the largest open question arrives with the architecture.
