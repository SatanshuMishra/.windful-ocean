---
Status: accepted
Date: 2026-08-16T04:44:49.127Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0456. The inserted decompose-and-emit MSP splits in two, and one specs[] entry is one MSP

## Context

0455 inserted a decompose-and-emit MSP ahead of D2 but left its shape open. Orientation against the stack base at 50cd0185 settled the consumer contract and surfaced two questions the ruling had not answered. First, granularity: cli.mjs dispatches exactly one claude -p child per specs[] entry (cli.mjs:165) and reads back verdict.structured.sha (cli.mjs:151-155), so a unit's request.prompt must instruct a child to implement and commit, which rules out a plan-shaped prompt. Second, size: a single unit carrying a pure projector, a decompose dispatcher and a file writer overshoots the 400-line review ceiling and mixes a pure module with a spawning executable in one reviewable change. Supporting facts: the decomposer emits MSP-level fileScope, leases.mjs fences concurrency on fileScope.edit, and buildInitialManifest (recovery.mjs:108-134) derives one integration branch and one contentHash per MSP. A task-level reading would need task-level fileScope, which nothing on this base produces, plus plan-to-task-graph and derive-edges, both outside cli.mjs's import closure.

## Options

- One specs[] entry per MSP, versus one per task inside an MSP
- Ship the inserted MSP as one unit, versus splitting it into a pure composer and a spawning emitter
- Defer both questions and let the implementer decide during the work

## Outcome

A specs[] entry is one MSP: one child implements the whole MSP and returns a commit sha, and specs[] and manifest.msps[] are two projections of the same set. The unit splits in two. D1b1 is a pure, I/O-free run-document composer plus tests - no fs, no spawn, no clock, no randomness - which keeps it deterministic and lets its tests call the real CLI validators. D1b2 is the thin executable that dispatches the decompose child, loads the implementer preamble, calls the composer and writes the document, and it carries its own flags for the inputs cli.mjs has no flag for: base branch, source prefix, worktree root and scoped check command. Both land on feat/mitosis-os-process before D2. The stack's MSP count is therefore no longer twenty-two, which is why c3 is rewritten to stop pinning a count. Deferring was refused: granularity is the single largest design question in the unit, and discovering it wrong mid-implementation wastes a whole MSP.
