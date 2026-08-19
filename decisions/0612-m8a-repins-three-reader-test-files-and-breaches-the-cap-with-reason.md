---
Status: accepted
Date: 2026-08-19T02:24:29.018Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0612. M8a repins the three reader-side test files its mandatory request fields broke; the 400 cap is breached with reason

## Context

M8a's lead returned blocked a second time on 2026-08-19 with all eight obligations done, acceptance red/green/inertness quoted, and the 0605 e2e condition green (62/62). npm test showed 41 new failures, all one cause: evaluate() now requires headRef and headPath, and 39 request literals in tests/boundary-gate-evasion.test.mjs (26), tests/boundary-input-bounds.test.mjs (8) and tests/phase-driver.test.mjs (7) omit them. The first two files have no owner row; the third is plausibly M9 (wave 5, blocked). The diff is already 430 added against A10's ~300 target and the 400 hard cap; remediation reaches ~476.

## Options

- Ship red on 41 tests as unverified-reasoned - breaks the green-branch invariant A9 ruled non-negotiable
- Cut a new unit for the pins - breaks the freeze and rule 3
- Widen M8a by the three test files, mandate a shared request-builder helper so the two fields are added once rather than across 39 literals, and record the cap as breached with reason: the added lines are mechanical field additions with near-zero review surface, the same rationale line 573 used to clarify the cap for M12b-2

## Outcome

Option 3. Helper first; literal-by-literal only where the helper does not fit. The PR body's --what names the three files as reader-side completion of the mandatory-field contract and states the cap breach with its reason in plain words. M9's dispatch is told phase-driver.test.mjs was touched by M8a. Two RUNBOOK corrections accepted as measured: only mitosis-gate.test.mjs:529 fails on the parent (retirement-census passes), and boundary-gate.test.mjs:207 moved to :212 gaining the two fields - byte-identity is unachievable for a unit that makes new request fields mandatory. The A15 real-IO test is restored at :836 with REAL_BOUNDARY_IO and both assertions, not substituted.
