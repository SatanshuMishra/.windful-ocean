---
Status: accepted
Date: 2026-07-30T04:33:59.032Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0110. The fix work-type pipeline ships first, feat second, sequenced by oracle strength and confidence

## Context

0106's third diagnosed error is pipeline expressed as closure-coupled imperative control flow rather than as data over one shared runtime, and it rates pipeline-as-data MEDIUM-HIGH - its lowest-confidence claim - against HIGH for the effector boundary and the durability model. Commit c5ba0d0 already declares a change type per MSP, and PR titles already carry the type vocabulary (feat fix refactor docs test chore perf ci), so the raw material for per-work-type pipelines exists. The open question was which work type gets the first pipeline.

## Options

- feat first, because that is where the token cost and the fan-out semantics live
- fix first, because it carries an objective machine-checkable oracle in the receipt
- docs/chore first as the cheapest possible slice
- refactor first, because behaviour preservation makes existing tests the oracle

## Outcome

FIX FIRST, feat second. The deciding property is the ORACLE. The receipts:gates discipline already requires a re-runnable acceptance test that is red before the fix and green after, so a fix pipeline has an objective machine-checkable success criterion, which lets the rebuild distinguish "the deterministic executor worked" from "the model got lucky". A feat pipeline is judged by review and cannot make that distinction - and validating a rebuilt core against a weak oracle is precisely how a second system passes its own tests and fails in production, which is the exact failure 0107 caught in the existing suite. SUPPORTING: fix is narrow enough to exercise the merge layer at depth 1, matching 0109; it exercises every layer except decompose (deterministic activities, one LLM activity, the human gate, verification); and it is the dominant real work in this tree, with three of the last five commits on feat/centralized-pr-creation being fix(...). NAMED COST, not to be softened: a fix pipeline will NOT validate the two-layer fan-out semantics and will NOT reproduce 0105's estimated 1-2M tokens per 6-MSP run, because that cost lives in multi-MSP feat runs. The ordering is accepted anyway because it sequences by confidence - prove 0106's HIGH-confidence claims (effector boundary, durability model) on a narrow work type, then extend to the MEDIUM-HIGH claim (pipeline-as-data, fan-out) - rather than betting the rebuild's first slice on its least certain layer. LANDING ORDER implied by 0107-0110: (1) a test harness that reproduces the real global surface, which is a 0107 prerequisite AND a live defect today; (2) the state model per 0108; (3) restack as a deterministic activity; (4) depth per 0109; (5) the fix pipeline.
