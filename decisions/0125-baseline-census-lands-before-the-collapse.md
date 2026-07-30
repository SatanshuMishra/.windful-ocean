---
Status: accepted
Date: 2026-07-30T06:39:21.465Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0125. The measurement MSP lands before the phase collapse, because 0115's falsifiers are unpayable once the baseline is gone

## Context

0115 attached three falsifiers to the collapse, all of them requiring a before-and-after replay of a real cluster set: it fails if spec-start to first implementer commit exceeds the hand-dispatch baseline, if dispatches per shipped MSP exceed roughly 10 on a zero-failure run, or if tokens per shipped MSP do not drop by the share the deleted phases represent. 0114 established that NO timing or journal data exists for the current 4,851-line engine and that every number in it is a dispatch count read from code. The natural MSP ordering puts the collapse first and measurement last, since measurement looks like reporting.

## Options

- Order the MSPs by the natural build order and add measurement at the end
- Land the baseline census first, on the current engine, before any phase is deleted
- Accept the 0115 falsifiers as unmeasurable and rely on dispatch counts read from code

## Outcome

MEASUREMENT FIRST, as MSP-1 immediately after the parity gate and ahead of every collapse MSP. Once a phase is deleted the current engine no longer exists to measure, so a census that lands last can only ever record the after half - and a falsifier that can never fire is, under 0112, a gate that cannot fail, which is worse than no gate because it manufactures false confidence. This is the same defect 0107 caught live in the test suite. IMPLEMENTATION: a budget verb folds the journal into dispatch counts per phase, per unit and per run plus wall clock per phase, captures the baseline on the CURRENT engine, and thereafter asserts the 3-fixed plus 9-per-MSP budget as a gate. That converts 0115's second falsifier from a promise into a failable assertion. CONSEQUENCE the spec states plainly: three performance claims - 8 round trips to 3 or 2, the 100-to-57 census, and the token drop - stay LABELLED UNMEASURED until this MSP produces a baseline. FALSIFIER per 0112 rule 3: if the journal shipped by step 3 does not record dispatch boundaries recoverably, none of the three can be evaluated at all and step 3 must be amended before the collapse proceeds.
