---
Status: accepted
Date: 2026-07-30T07:01:35.880Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0127. MSP-0's falsifier does not fire, but the opts.phase extractor needs two rules the spec omits

## Context

MSP-0's falsifier: if the extractor cannot enumerate opts.phase literals from source without evaluating it, the third parity surface is not statically decidable and finding 1 must be reopened as a decision. Run before elaboration per governing law 5.

## Options

- Falsifier fires: reopen finding 1 as a user decision
- Falsifier survives unconditionally: implement the naive literal extractor
- Falsifier survives conditionally: implement with the rules the two exceptions require

## Outcome

Survives conditionally. `phase:` occurs 47 times in mitosis.js, not the 45 the spec's census reports; the spec counted only the literal form. The two extra sites are different in kind. mitosis.js:3321 is `function makeRemediation({ ..., phase: phaseName, ... })` — a destructuring rename in a parameter list, not an agent option at all, so it is a false positive a naive regex would count. mitosis.js:3345 is a genuine opts.phase whose value is the forwarded `phaseName`. Traced all ten makeRemediation call sites: every one passes a string literal — Waves (:1160), Reconcile (:3724), Decompose (:3898), Ship (:4206, :4354), Plan (:4426), Plan review (:4469), Parallelize (:4500), Branch (:4592, :4619). The dynamic site is therefore statically decidable by one hop of same-file named-parameter dataflow, and every resolved value is already declared. So finding 1 stays a rule and is NOT reopened. MSP-0's extractor must (a) exclude destructuring-pattern matches, and (b) resolve a forwarded phase by following its function's call sites, halting fail-closed if any call site passes a non-literal. A naive grep extractor would silently under-count and give a false-clean parity verdict — which is the exact failure class the gate exists to prevent. No AST parser is available: package.json declares zero dependencies.
