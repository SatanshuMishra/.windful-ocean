---
Status: accepted
Date: 2026-07-31T06:36:49.860Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0147. M1 records threatened on the candid reading, because the change edits the file hosting the coverage job

## Context

The B-6 coverage entry had to assign M1 a verdict. The MSP appends one run step to the test job of .github/workflows/test.yml — the same file that carries the invariant-coverage job the M1 gate runs — while leaving that job byte-unchanged, and editing neither docs/invariants/registry.json nor scripts/invariant-coverage-check.mjs. Spec 15.4 flagged this as genuinely arguable and noted a reviewer could reasonably read it the other way. A verdict answers "does this change bear on the invariant", not "does the invariant hold". This was the second of the two decisions the resume brief required before dispatch.

## Options

- not-threatened, on the ground that the invariant-coverage job is byte-unchanged and the M1 mechanism is consumed rather than modified
- threatened, on the ground that the change edits the file that hosts the coverage job and so bears on the mechanism

## Outcome

Recorded threatened, per 0143's rule that coverage rows read candidly. The row states plainly what the edit is (one appended run step) and what it is not (the invariant-coverage job byte-unchanged, registry and check script untouched), so a reviewer disagreeing has the facts to hand. Consistent with the standing finding that M1 verdict truthfulness is a HUMAN/orchestrator gate: this verdict was set by the orchestrator, not delegated. Spec 15.4's remedy stands if a reviewer prefers the other reading — a one-word edit to the entry, not a rework. The entry passed scripts/invariant-coverage-check.mjs and the merged CI run is green, so nothing about the mechanism regressed under the candid reading.
