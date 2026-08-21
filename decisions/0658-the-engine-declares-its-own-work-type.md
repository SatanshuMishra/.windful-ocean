---
Status: accepted
Date: 2026-08-21T03:02:36.692Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0658. The engine declares its own work type rather than the fixture relaxing its gate

## Context

A unit adding a new helper writes a test importing an export that does not exist on the base commit. The enforcer overlays head test files onto the base tree, so that test fails on base as a SyntaxError, which classifies as a load error. Under the standard on-load-error-red block setting, a load-error red is only accepted when the pull request body declares a feature work type. The engine's pull-request composer passes only title, why, what, verified, not-verified and supersedes, and the term work-type appears nowhere in the engine, so every feature unit blocks structurally. Reproduced on a real clone against the pinned enforcer revision: without the declaration BLOCK and exit 1, with it a verified receipt and exit 0. The measurement substrate carries the same setting, so the criterion requiring every opened pull request to be green is unreachable as things stand.

## Options

- Have the engine emit a work-type line derived from the MSP's own declared conventional-commit type, the same source the title already uses
- Relax the substrate's on-load-error-red setting to warn so the measurement run stops hitting it
- Leave both and accept that every feature unit's pull request blocks

## Outcome

The engine emits the work type it already knows. Relaxing the fixture would have measured the engine against a laxer bar than any real repository applies, and would have hidden a defect that blocks the engine everywhere rather than only here. The mapping is explicit and total over the accepted type list and halts loudly on an unmapped type, because a silently missing declaration is the defect being fixed. The centralized pull-request tool already accepts the line through its why flag and needs no change. Note the asymmetry deliberately: refactor and chore invert the proof obligation and skip the receipt, coverage and mutation gates, while feature only tells the load-error branch that a red on base is expected.
