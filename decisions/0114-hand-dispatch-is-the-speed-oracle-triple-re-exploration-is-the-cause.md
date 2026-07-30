---
Status: accepted
Date: 2026-07-30T05:40:38.206Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0114. Hand-dispatched agents are the speed oracle; the cost is an 8-round-trip runway and three discarded repo explorations

## Context

User rated 0104's "wall-clock barely improves" as CRITICAL and unacceptable, separating human merge latency (out of scope per 0111) from machine-and-model time (in scope). Supplied a natural experiment from another project: a full mitosis run shipped only TWO clusters before failing; hand-dispatching the same work as individual planning and implementation agents within clusters went "a LOT quicker". Fable phase audit run 2026-07-30 against the current 4,851-line engine.

## Options

- Treat hand-dispatch as anecdote and optimize the existing phases
- Adopt hand-dispatch as the explicit oracle the engine must beat, and audit why it wins
- Accept the overhead as the price of isolation and durability

## Outcome

HAND-DISPATCH IS THE ORACLE, ratified. The engine must beat a human hand-dispatching plain subagents or it does not deserve to exist. What hand-dispatch does NOT give, and what the engine may still charge for: worktree isolation, the green-branch invariant, per-MSP PR discipline, parallel-safety, crash durability, fail-closed halting. MECHANISM, measured not guessed. (1) TIME TO FIRST LINE OF CODE IS 8 SEQUENTIAL MODEL ROUND-TRIPS: reconcile mitosis.js:3637, decompose :3805, checkpoint-init :3897, prepare-probe :3921, plan :4337, plan-review :4365, parallelize :4403, branch :4504/:4535, then the first implementer. Each arrow is a code-level await; each hop is a fresh ZERO-SHARED-CONTEXT subagent re-orienting from nothing. Two are trivially off the critical path - checkpoint-init is fire-and-forget (failure only logs, :3907-3913) and prepare-probe depends only on baseBranch, not decompose (:3921-3932). (2) THE REPO IS EXPLORED FROM SCRATCH BY A MODEL THREE TIMES AND THE FIRST TWO ARE DISCARDED: decompose runs the full LSP/graphify stack and keeps seven fields per MSP; the planner then gets only msp.rationale - ONE SENTENCE - plus fileScope and spec path (:4341-4343, seed :901-905) and re-explores from nothing; parallelize re-runs LSP call-hierarchy and graphify AGAIN for task edges. Only derive-edges.mjs fileScope overlap is deterministic and free. THIS IS THE ENTIRE DELTA the user felt: the human carried context between steps in their head, the engine re-derived it through a model, per MSP. (3) CENSUS, 6 MSPs x 3 tasks, zero failures: 100 dispatches (4 fixed + 6x16), 45 of them DETERMINISTIC WORK IN PROSE, five pinned to opus for git transcription (:4543, :4516, :945, :4645). (4) ONE PHASE CANNOT CHANGE ITS OWN OUTCOME: resolvePlanReview :889-899 turns a contentless non-approval into one re-review then AUTO-APPROVES BY CONSTRUCTION - waste by definition under 0112. (5) Also measured: journal appends are standalone dispatches to append ONE line (:3897, :4140, :4081, :4162, :4756); a plan-probe dispatch runs only test -f and test -s (:4316-4331); parallelize re-emits ~13.8KB of prompts plus every task fullText verbatim per MSP and a pointer PARKS the MSP (:4420, :4463-4465); the journal is paged through model output in 2000-char chunks each launch (:3641, :3674-3677); clusters are derived at :3883 then IGNORED by the flat scheduler; the boundary base census re-derives per MSP for siblings sharing a base sha (:1208-1218); a non-built resume re-pays Parallelize, Branch and the whole engine including re-reviewing passing tasks (gating exists only at :4251 and :4355). NO TIMING OR JOURNAL DATA EXISTS FOR THE CURRENT ENGINE - all counts are read from code; prior token figures are from audits of the older 3,699-line version and must be labelled as such.
