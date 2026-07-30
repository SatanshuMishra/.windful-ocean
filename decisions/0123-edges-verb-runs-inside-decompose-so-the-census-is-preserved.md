---
Status: accepted
Date: 2026-07-30T06:38:53.960Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0123. The derive-edges verb runs inside the Decompose dispatch, preserving 0115's 3-fixed plus 9-per-MSP census

## Context

0115 fixed the census at 100 to 57 dispatches for a 6-MSP zero-failure run (3 fixed + 6 x 9) and attached a falsifier that fires if dispatches per shipped MSP exceed roughly 10. It reached that number assuming edges would be derived IN-ENGINE and therefore free, where pathsOverlap and scopesOverlap already live. 0116 then rejected fileScope-only edges and 0120 proved edge derivation must run as a deterministic verb driving a language server. A verb is not free: under 0107 every deterministic activity is still one agent() dispatch carrying one command string, so a naive allocation adds one dispatch per MSP and pushes the per-MSP count to 10, exactly at the falsifier threshold.

## Options

- Allocate derive-edges its own per-MSP dispatch and raise 0115's per-MSP budget from 9 to 10
- Invoke the verb inside the existing decompose-and-cut dispatch, once per run, covering every MSP
- Re-open 0116 and accept fileScope-only edges to keep the count at 9

## Outcome

INSIDE the Decompose dispatch. The decomposer already holds the whole repo picture when it emits each task's fileScope, so invoking the verb there adds OUTPUT, not exploration - the same argument 0115 used to fuse decompose and cut - and it adds no round trip. Fixed dispatches stay 3 (run-probe, decompose-and-cut, gate-probe) and per-MSP stays 9 (3 implementers, 3 design reviews, 2 integrate, 1 ship). A ratified number is preserved rather than silently inflated. SECOND ALLOCATION fixed by the same reasoning: publish and ci-watch are two verb invocations in ONE ship dispatch, because the CI wait blocks in a subprocess and costs zero model tokens, per rules/common/performance.md. COST ACCEPTED: the decompose dispatch now runs a language-server query per MSP at 2.7-4.1s measured, so roughly 25s of in-dispatch wall clock for six MSPs - Speed traded for Optimization and Quality, which is the correct direction under the pillar order. GUARD, since the sandbox forces the agent to transcribe the verb's output: the engine validates the edge document's shape AND requires the declared seed set per 0120 rule 2, halting fail-closed on a missing declaration rather than accepting a plausible edge list.
