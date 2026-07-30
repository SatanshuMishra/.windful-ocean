---
Status: accepted
Date: 2026-07-30T23:48:28.767Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0136. Defer Track A entirely until every mitosis MSP is delivered

## Context

The two-track invariant plan sequences Track A (continuity-ledger-plugin hooks self-heal) and Track B (workflow sandbox harness) concurrently after a shared Wave 0, with Step A-1 flagged as a HARD GATE and the missing round-3 review. Mid-session the user directed that Track A be deferred and that work focus specifically on the mitosis improvements this thread was created for, returning to the continuity-ledger changes only after all mitosis MSPs are delivered. Track B IS the mitosis work: Step 1 of the core rebuild per 0133.

## Options

- Execute the plan as written, both tracks concurrently after Wave 0
- Defer Track A entirely and execute only Track B
- Defer Track B and clear the A-1 hard gate first

## Outcome

Track A deferred entirely by explicit user directive. fix/hooks-prior-path-self-heal stays at 5bc19a4, unreviewed and unlanded; A-1, A-2, A-3 and the Track A half of Wave 0 are deferred, not abandoned, and resume after the mitosis MSPs land. Two consequences must be carried. (1) The tracks are independent as code but coupled by one shared gate: the continuity plugin manages .windful-ocean's core.hooksPath, so the local pre-commit gate that runs Track B's tests is enforced by a deployed cache that is a HAND-PATCH per 0132, which a plugin refresh would silently revert. A local green is therefore NOT authoritative for Track B; GitHub Actions is the oracle of record. (2) The A6/M6 deployment-integrity window stays open for the whole deferral.
