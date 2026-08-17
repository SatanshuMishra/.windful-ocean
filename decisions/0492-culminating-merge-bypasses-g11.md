---
Status: accepted
Date: 2026-08-17T00:33:34.644Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0492. The culminating merge bypasses G11 rather than acknowledging eleven test retirements

## Context

PR #152 integrates the eighteen-MSP stack into main: 303 commits, 216 files, +32784 and -16124. Twelve checks pass; receipts BLOCKs on G11 alone with eleven deleted test files and acknowledged false. G11's sanctioned remedy is a test-removal line in the pull-request body, which GATES.md:445 records as tracked, never blocked, the honesty ladder applied to the referee itself. Two facts closed that path: a pull-request body is fixed at creation by the pull-requests rule, and pr-create exposes no flag that emits such a line, so any acknowledgement required a successor pull request. A pr.mjs fix would additionally have had to land on main before taking effect, because ~/.claude/lib is a symlink into the primary checkout, the same in-force trap as 0488.

## Options

- Add a --test-removal flag to pr-create, land it on main, then supersede #152
- Supersede #152 immediately carrying the acknowledgement as a field value, and file the tool gap
- Merge #152 with receipts red as repository admin

## Outcome

The user ruled for the admin override, making the stack's culminating merge the one pull request that bypassed the enforcer. The acknowledgement G11 asked for is recorded here instead, so the reason the eleven suites went is not lost even though the pull request does not carry it. Every one covered code this stack deletes or a mandate an earlier decision retired: workflow-sandbox, workflow-sandbox-census, workflow-sandbox-policy and workflow-sandbox-traps cover workflow-sandbox.mjs, deleted in the same stack; mitosis-scheduler and frontier-train-e2e cover the legacy .claude/workflows/mitosis.js, also deleted; dead-export-lint is the suite whose revival 0460 refused; mirror-guard covers the census mandate 0439 retired; and gh-scope-lint, prepare-probe-template-scope and reconcile-only-advance-characterization cover retired scope and characterization surfaces. None was deleted to make a failing test pass, which is the reward-hack G11 exists to catch. The capability gap is filed rather than folded in: pr-create has no --test-removal flag, so every future pull request retiring a subsystem's tests meets the same wall, and the agent that met it emitted CAPABILITY-BLOCKED instead of working around it. The merge itself is a human action that no session can perform.
