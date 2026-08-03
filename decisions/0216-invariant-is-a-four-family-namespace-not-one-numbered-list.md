---
Status: accepted
Date: 2026-08-03T15:02:20.270Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0216. "Invariant" names four disjoint families in this project, and the preflight family is not a subset of I1-I10

## Context

The user's mitosis run halted on a merge-boundary preflight reporting invariants "1, 2, 3 + bypass", and asked why that list does not match M8's I1-I10 — a subset relationship being the natural first reading. Grep and read at 4fd03c2 established there is no overlap at all: merge-boundary-preflight.mjs:20-27 declares its own seven check ids with their own numbering, disjoint from both M8's plan invariants and docs/invariants/registry.json. The confusion is structural rather than incidental, because the same word is deliberately reused at four layers, and a future session will hit it again.

## Options

- Read the preflight numbers as a subset or renaming of I1-I10 — refuted by code, the check ids and subjects are disjoint
- Treat registry.json (B1-B6 / M1-M6) as the single canonical invariant namespace and the others as informal — refuted, the preflight numbering gates a real exit code and M8's I1-I10 governed a shipped MSP
- Record the taxonomy explicitly: four families, distinguished by SUBJECT and by WHEN they are checked
- Renumber or unify the families into one namespace

## Outcome

Recorded the four-family taxonomy, distinguished by subject and by check time. Preflight 1/2/3 + bypass = the TARGET repo's permissions and branch rules, checked before dispatch (merge-boundary-preflight.mjs). I1-I10 = runtime behavior of the CI-to-green loop, properties of the engine's own source (ci-escalation.mjs plus the mitosis.js twin). B1-B6 = the sandbox that runs the workflow. M1-M6 = the method by which changes are made and proven (both in docs/invariants/registry.json). Renumbering was declined: the families have genuinely different subjects, lifetimes and enforcement surfaces, and collapsing them would hide that. The load-bearing connection is recorded instead — I4, I5 and I6 each ASSUME a human merge gate exists, and the preflight is what proves that assumption holds in the target repo, which is why its halt is unconditional.
