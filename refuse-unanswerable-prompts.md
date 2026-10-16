# refuse-unanswerable-prompts: Refuse permission prompts no one can answer, and drop the two-fix-round cap from the rules
Status: parked
Updated: 2026-10-16T21:39:10.583Z
Next ids: c3 D4 R1 S1

## Goal

Ship one MSP pull request into the FEATURE branch that adds a PermissionRequest hook refusing, in bypass mode, every subagent prompt and every main-conversation prompt except AskUserQuestion, ExitPlanMode and db-gate's database asks, and that replaces 'at most two fix rounds' in the always-loaded rules with the converging rule.

## Done when

- [x] c1 The MSP pull requests (refusal-hook and rule-text, per D2) into the FEATURE branch are open, ready for review unless a diagnosis classed a blocker blocked, assigned to the owner, with the title and body mitosis wrote. evidence: https://github.com/SatanshuMishra/.windful-ocean/pull/338 (mitosis/refusal-hook) and https://github.com/SatanshuMishra/.windful-ocean/pull/339 (mitosis/rule-text) are open into feat/refuse-unanswerable-prompts, draft=false, assigned to SatanshuMishra, opened through the GitHub MCP tool with mitosis's titles and bodies; the review comment is posted on #338.
- [x] c2 Every confirmed blocker is fixed with a receipt test that failed first, or named at the top of a draft pull request after a diagnosis classed it blocked. evidence: C1/U1 (stale test:ci pin) fixed in b472d5b9 with node --test scripts/dotfiles/tests/ci.test.mjs red at 4c3b5c41 and green after; validator round 2 marked P1 fixed; suite 695/695; advisory C2 fixed in the same commit; no blocker diagnosed blocked.

## Where things stand

Both MSP pull requests are open into feat/refuse-unanswerable-prompts, waiting for the owner's merge: #338 refusal-hook (green in round 2 at b472d5b9) and #339 rule-text (green in round 1 at 14e1abd3). The new hook is not installed in the live configuration; it reaches the owner only after the FEATURE pull request merges and the live clone pulls.

## Next step

The owner starts Integration by saying the MSP pull requests (#338 and #339) merged; then resume_thread refuse-unanswerable-prompts, read ~/.mitosis/.windful-ocean/refuse-unanswerable-prompts/CHARTER.md, Sync, run pipeline integration-ready --repo /Users/satanshumishra/Documents/DevLabs/.windful-ocean --slug refuse-unanswerable-prompts, and invoke lighthouse:test with the core and FEATURE branches from feature.json.

Needs: D2, D3.

## Decisions in force

- D1 Interphase hand-off: build the spec as handed off: Build the two Steps as handed off on the FEATURE branch; any later gap is filled from the Intent lines and recorded as an assumption.
- D2 Ship the two MSPs mitosis planned: Build two MSPs, refusal-hook and rule-text; criterion c1 covers both MSP pull requests (Assumption, relies on I1).
- D3 Ship boundary: push both MSPs and open their pull requests: Run SHIP=1 run.zsh --resume and open both pull requests ready for review, assigned to the owner, with the title and body mitosis writes.

## Open risks

## Settled, do not reopen

## Where the details live

- Spec: /Users/satanshumishra/Documents/DevLabs/.windful-ocean/docs/specs/refuse-unanswerable-prompts.md
- Decisions: /Users/satanshumishra/Documents/DevLabs/.windful-ocean/docs/specs/refuse-unanswerable-prompts.decisions.md
- Record: /Users/satanshumishra/Documents/DevLabs/.windful-ocean/docs/specs/refuse-unanswerable-prompts.record.json
- Run home: ~/.mitosis/.windful-ocean/refuse-unanswerable-prompts/
- Mitosis run dir: ~/.mitosis/runs/.windful-ocean/refuse-unanswerable-prompts
