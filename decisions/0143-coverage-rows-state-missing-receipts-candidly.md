---
Status: accepted
Date: 2026-07-31T01:48:35.420Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0143. A coverage row states an unestablished receipt candidly, and a CI run counts as the receipt

## Context

M3 requires every fix to ship an acceptance test red on the parent commit and green on the fix, plus an inertness mutation. Authoring the sandbox harness entry exposed two gaps in applying that retroactively. First, four of the five sandbox fix commits (937b1cd, e40a292, 750cd14, 3e59d05) ship their oracle in the SAME commit as the fix, so the test does not exist on the parent and no red-on-parent run was ever recorded; the row could either assert a receipt that does not exist or admit it. Second, 2f4ee4d's symptom is not reproducible on the developer machine at all: it classifies Temporal, which is absent from a DONT_CONTEXTIFY realm global on the local node v26.4.0, while CI resolves node 26.x to 26.5.1 where it is present. A local-reproduction-only standard would have marked a genuinely receipted fix as unreceipted. The first draft of the row did exactly that, saying the red was asserted only from the commit's own report, when CI run 30591117430 in fact records the B1 and B5 censuses failing at parent 3e59d05 and run 30593758261 records success at 2f4ee4d.

## Options

- Assert red-before-green for the whole range and let the reviewer assume the receipts exist
- Mark M3 threatened with a check that admits no receipt exists anywhere in the range
- State per-commit which reds are established and by what evidence, and name the ones that are not, accepting a recorded CI run as a valid receipt where local reproduction is impossible

## Outcome

A coverage row enumerates its evidence per commit and says plainly which reds are NOT established, rather than asserting a uniform receipt. A recorded CI run is a valid red-before-green receipt: environment-dependent reds are real reds, and CI is the only place some of them are observable. Two of the five are receipted on that standard - 750cd14 red on e40a292 by construction, 2f4ee4d red on 3e59d05 by CI run - and the other two are named as unreceipted. Two consequences bind future work. An authoring subagent cannot cite evidence it never saw, so the orchestrator must supply CI receipts it holds or the row will understate; this is the concrete mechanism behind the spec's line-124 residual that verdict truthfulness is a human gate. And B-6 must not repeat the pattern: write the failing test in its own commit before the fix, so its receipt needs no archaeology.
