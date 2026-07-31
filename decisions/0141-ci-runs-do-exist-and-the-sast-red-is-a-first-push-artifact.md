---
Status: accepted
Date: 2026-07-31T00:15:06.976Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0141. CI runs do exist for every branch, and the red sast job is a first-push full-scan artifact, not a regression

## Context

The brief asserted "NO CI RUN EXISTS for any branch; the invariant-coverage job has never executed". Both halves are false. gh run list shows test and security runs on all three branches, and the invariant-coverage job already ran green in push mode on feat/invariant-coverage-gate (run 30585613111). Separately, the security workflow's sast job is red on docs/two-track-invariant-plan and feat/invariant-coverage-gate but green on feat/workflow-sandbox-harness, which looked branch-dependent and is not. security.yml resolves a diff baseline from github.event.before on push; on the FIRST push of a new branch that value is all-zeroes, the baseline resolves empty, and semgrep runs a FULL scan that surfaces 3 blocking findings pre-existing on main - among them the non-literal-RegExp ReDoS rule at mitosis-gate.mjs:455. Subsequent pushes to the same branch get a real baseline, scan diff-aware, and pass. The docs branch adds only one markdown file yet shows the same 3 findings, and the gate branch shows 3 findings across 302 targets versus the docs branch's 3 across 300, which is the evidence that neither branch introduces a new finding.

## Options

- Treat the sast red as a pre-existing-on-main artifact that a pull_request event will not reproduce, and proceed
- Block landing until the 3 pre-existing main findings are adjudicated
- Disable the sast gate

## Outcome

Proceed. On a pull_request event security.yml takes its baseline from github.event.pull_request.base.sha, a real commit, so the scan is diff-aware against main and the 3 pre-existing findings are excluded; the PR-event sast result is the one that governs. Two consequences are recorded rather than acted on now. First, main is carrying 3 findings that only a full scan sees, which the diff-aware design structurally hides - that is fix/semgrep-pin-readjudication's territory, not this thread's. Second, one of the three sits at mitosis-gate.mjs:455 inside resolveCallSitePhases, the same file B-6 must edit, so a diff-aware scan on the B-6 PR will surface that finding as new the moment those lines are touched. B-6 must budget for adjudicating it.
