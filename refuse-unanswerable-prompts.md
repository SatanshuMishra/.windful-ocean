# refuse-unanswerable-prompts: Refuse permission prompts no one can answer, and drop the two-fix-round cap from the rules
Status: done
Updated: 2026-10-17T00:41:58.110Z
Next ids: c4 D4 R1 S1

## Goal

Ship one MSP pull request into the FEATURE branch that adds a PermissionRequest hook refusing, in bypass mode, every subagent prompt and every main-conversation prompt except AskUserQuestion, ExitPlanMode and db-gate's database asks, and that replaces 'at most two fix rounds' in the always-loaded rules with the converging rule.

## Done when

- [x] c1 The MSP pull requests (refusal-hook and rule-text, per D2) into the FEATURE branch are open, ready for review unless a diagnosis classed a blocker blocked, assigned to the owner, with the title and body mitosis wrote. evidence: https://github.com/SatanshuMishra/.windful-ocean/pull/338 (mitosis/refusal-hook) and https://github.com/SatanshuMishra/.windful-ocean/pull/339 (mitosis/rule-text) are open into feat/refuse-unanswerable-prompts, draft=false, assigned to SatanshuMishra, opened through the GitHub MCP tool with mitosis's titles and bodies; the review comment is posted on #338.
- [x] c2 Every confirmed blocker is fixed with a receipt test that failed first, or named at the top of a draft pull request after a diagnosis classed it blocked. evidence: C1/U1 (stale test:ci pin) fixed in b472d5b9 with node --test scripts/dotfiles/tests/ci.test.mjs red at 4c3b5c41 and green after; validator round 2 marked P1 fixed; suite 695/695; advisory C2 fixed in the same commit; no blocker diagnosed blocked.

- [x] c3 lighthouse has tested feat/refuse-unanswerable-prompts against main and the FEATURE pull request is open, with every confirmed failure fixed after a diagnosis or named after a diagnosis classed it blocked. evidence: lighthouse verdict green with no failures (suite passed on both builds, 6 paths passed, spec 5.4 unproven by design) in ~/.mitosis/.windful-ocean/refuse-unanswerable-prompts/lighthouse/verdict.json; https://github.com/SatanshuMishra/.windful-ocean/pull/341 is open main <- feat/refuse-unanswerable-prompts, ready for review, assigned to SatanshuMishra, mergeable.

## Where things stand

The work is merged into main as SatanshuMishra/.windful-ocean#341 (0d193d5b), and pipeline clean has removed the run's branches, worktrees, run folders and spec files. The owner's checkout still sits at 47cb12bc: its fast-forward is refused because the owner's untracked .lighthouse/profile.json differs from the one #341 committed. The hook goes live only when the live clone ~/.windful-ocean pulls and syncs.

## Next step

None: the thread is done.

## Decisions in force

## Open risks

## Settled, do not reopen

## Where the details live

- Merged change: https://github.com/SatanshuMishra/.windful-ocean/pull/341
