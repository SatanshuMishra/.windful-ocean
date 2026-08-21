---
Status: accepted
Date: 2026-08-21T22:29:05.402Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0665. The run-4 dropped unit is an Integrate-to-Ship defect, not a resume defect

## Context

The SPEC's M4 row 8 and decision 0662 both attribute run 4's lost unit to resume. Run 4's own stdout shows resume.built carrying the unit, so resume-plan.mjs carried it correctly; the drop happens between Integrate and Ship, caused by a leaked boundary worktree whose collection was refused. The SPEC's verbatim unit test is therefore not implementable: it asserts plan.built.includes(id) where plan.built holds objects, plan.pending does not exist, and the behaviour it asserts is already correct, so it could never go red.

## Options

- Write the SPEC's test verbatim and accept a test that can never fail
- Keep the mandated filename and re-aim the assertion at the real defect surface
- Edit the frozen SPEC to correct the attribution

## Outcome

Kept the mandated filename resume-state-carry.test.mjs and re-aimed it at integrateBuilt and integrateSummary, the real drop surface. Fixed integrate-plan.mjs to carry the dropped diagnosis and added boundary-worktree-reclaim.mjs to reclaim the leaked worktree. Writing the test as specified would have manufactured exactly the vacuous green this SPEC exists to cure. The SPEC stays frozen and unedited; the misattribution is filed against it.
