# Mitosis Review-Layer Admission Gate

- Date: 2026-07-18
- Status: Active
- Spec: `docs/superpowers/specs/2026-07-17-mitosis-optimization-design.md`, WS-7.3 (guardrail G5)

## The rule

Any new LLM review layer added to the `/mitosis` engine must, before it ships, declare both of the following:

1. **The distinct property it checks.** A specific quality, correctness, or risk dimension that no deterministic gate in the pipeline already covers. "Another look at the diff" is not a distinct property; naming the exact dimension (e.g. spec-conformance, adversarial-quality critique, security-scoped CWE findings) is required.
2. **The exact code path that READS its verdict and changes behavior on failure.** A file:line (or named function) where the review's output is consumed, and a description of the behavior change that occurs when the verdict is a failure (halt, park, re-dispatch, escalate, block merge, etc.).

A review layer that cannot name both is not admitted. A review layer whose output is written but never read by any consumer is deleted by construction — that is exactly the failure this gate exists to prevent.

## Grounding example: O-A, the inert Final review

The design spec's diagnostic audit (`docs/superpowers/specs/2026-07-17-mitosis-optimization-design.md:18`) identified this exact failure, tagged **O-A**:

> O-A — the Final review is inert. `result.finalReview` is written (`mitosis.js:1189`, `run-engine.mjs:457`) and read by no code. Its deletion was locked in decision R7-1 (2026-07-15) and never landed.

Re-confirmed against the live worktree code on 2026-07-18 (line numbers drift from the audit snapshot; the code wins over the anchor):

- `.claude/lib/superpowers-parallel/run-engine.mjs:457` — `result.finalReview = await guard.dispatch(...)` writes the verdict.
- `.claude/workflows/mitosis.js:1123` — the twin engine copy writes the same field at its own line (drifted from the spec's cited `:1189` to `:1123` in this worktree; still the same write-only pattern).
- A repo-wide search for `.finalReview` reads finds exactly one hit outside the two write sites: `.claude/lib/superpowers-parallel/tests/run-engine.test.mjs:65`, an `assert.ok(result.finalReview)` — a test asserting the field exists, not a production code path that reads the verdict and changes behavior on failure.

No production code path reads `result.finalReview` and branches on it. The Final review dispatches a real Opus call, burns real tokens, and its verdict has zero effect on control flow — it cannot halt a bad merge, cannot trigger remediation, cannot block anything. That is precisely the shape this admission gate is designed to catch before a review layer ships, rather than years after, via a diagnostic audit.

## What the gate requires going forward

Before adding or re-enabling any LLM review stage in the engine (either twin: `.claude/workflows/mitosis.js` or `.claude/lib/superpowers-parallel/`):

- Document the distinct property (property 1 above) in the workstream or PR description.
- Cite the exact `path:line` consumer of the verdict (property 2 above) — the branch, gate, or state transition that reads it.
- If no such consumer exists yet, the review call is not added until the consumer is built in the same change, or the review is deferred until it is.
- If an existing review layer is later found to have no consumer (as O-A did), the correct resolution is deletion, not documentation-after-the-fact — a consumer-less review is deleted by construction, per guardrail G5 (`docs/superpowers/specs/2026-07-17-mitosis-optimization-design.md:234`).

This gate is a Pillar-1 (robustness) guardrail: it exists to stop reviews that produce no safety benefit from continuing to consume tokens as if they did, and to prevent recurrence of the exact gap class recorded as recurring-mistake G5.
