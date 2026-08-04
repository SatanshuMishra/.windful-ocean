---
Status: accepted
Date: 2026-08-04T06:04:15.307Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0229. The re-baseline pass amends the SPEC document only; no live codebase change

## Context

The dispatch brief's phase C reads "MAKE THE CHANGES. Land the prerequisite work that phase B decides to build." Read literally that authorises building unlanded preconditions - a test harness, a journal subsystem - inside a background workflow, against paths held by the human write-approval guard. The orchestrator flagged the tension before dispatching: the brief's own rule is to record a decision per material change rather than silently edit, which a background agent cannot satisfy for work it would ratify itself.

## Options

- Land the prerequisite work phase B recommends inside the workflow, accepting per-write approval prompts; Amend the SPEC document only and treat every code change as a separate ratified call; Defer phase C entirely and return only audit and remedy findings

## Outcome

DOCUMENT ONLY, by explicit user directive mid-session: "`fix` in the previous prompt meant SPECIFICALLY for the SPEC. e.g., The SPEC needs to be updated to reflect recent changes, gaps, etc. NOT live changes in the codebase." Every agent in both workflows was consequently fenced read-only on the repository, and the fence was promoted to a checked invariant (I6 SCOPE FENCE). It held: the final verifier confirmed git status returns exactly the five pre-existing dirty paths with nothing staged, and HEAD unmoved at da0cefd. This also dissolved the deadlock risk flagged at dispatch - no guarded write under .claude/{hooks,rules,lib,workflows} was ever attempted, so no unattended fan-out stalled awaiting approval. CONSEQUENCE: phase C is narrower than the brief's wording, and landing any precondition work remains future work gated on 0133's funding order, Step 1 first and Step 3 second, each needing its own ratified decision.
