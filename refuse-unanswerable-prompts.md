# refuse-unanswerable-prompts: Refuse permission prompts no one can answer, and drop the two-fix-round cap from the rules
Status: active
Updated: 2026-10-16T21:21:33.894Z
Next ids: c3 D3 R1 S1

## Goal

Ship one MSP pull request into the FEATURE branch that adds a PermissionRequest hook refusing, in bypass mode, every subagent prompt and every main-conversation prompt except AskUserQuestion, ExitPlanMode and db-gate's database asks, and that replaces 'at most two fix rounds' in the always-loaded rules with the converging rule.

## Done when

- [ ] c1 The MSP pull requests (refusal-hook and rule-text, per D2) into the FEATURE branch are open, ready for review unless a diagnosis classed a blocker blocked, assigned to the owner, with the title and body mitosis wrote.
- [ ] c2 Every confirmed blocker is fixed with a receipt test that failed first, or named at the top of a draft pull request after a diagnosis classed it blocked.

## Where things stand

FEATURE branch feat/refuse-unanswerable-prompts is cut from main at b8d992f8 and pushed; plan 0615d7029d42 holds two MSPs, refusal-hook (top tier) and rule-text (cheap tier); both MSPs are built and committed (refusal-hook 4c3b5c41, rule-text 14e1abd3) and in review round 1; the refusal-hook suite has one new failure, scripts/dotfiles/tests/ci.test.mjs pinning the old test:ci string.

## Next step

Collect the round-1 code and security review arrays (both conformance audits returned none), write each MSP's findings.json, then run pipeline candidates, the validator, record and verdict.

Needs: D1, D2.

## Decisions in force

- D1 Interphase hand-off: build the spec as handed off: Build the two Steps as handed off on the FEATURE branch; any later gap is filled from the Intent lines and recorded as an assumption.
- D2 Ship the two MSPs mitosis planned: Build two MSPs, refusal-hook and rule-text; criterion c1 covers both MSP pull requests (Assumption, relies on I1).

## Open risks

## Settled, do not reopen

## Where the details live

- Spec: /Users/satanshumishra/Documents/DevLabs/.windful-ocean/docs/specs/refuse-unanswerable-prompts.md
- Decisions: /Users/satanshumishra/Documents/DevLabs/.windful-ocean/docs/specs/refuse-unanswerable-prompts.decisions.md
- Record: /Users/satanshumishra/Documents/DevLabs/.windful-ocean/docs/specs/refuse-unanswerable-prompts.record.json
- Run home: ~/.mitosis/.windful-ocean/refuse-unanswerable-prompts/
- Mitosis run dir: ~/.mitosis/runs/.windful-ocean/refuse-unanswerable-prompts
