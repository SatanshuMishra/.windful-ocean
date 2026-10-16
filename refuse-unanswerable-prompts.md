# refuse-unanswerable-prompts: Refuse permission prompts no one can answer, and drop the two-fix-round cap from the rules
Status: active
Updated: 2026-10-16T21:09:20.252Z
Next ids: c3 D2 R1 S1

## Goal

Ship one MSP pull request into the FEATURE branch that adds a PermissionRequest hook refusing, in bypass mode, every subagent prompt and every main-conversation prompt except AskUserQuestion, ExitPlanMode and db-gate's database asks, and that replaces 'at most two fix rounds' in the always-loaded rules with the converging rule.

## Done when

- [ ] c1 The MSP pull request into the FEATURE branch is open, ready for review unless a diagnosis classed a blocker blocked, assigned to the owner, with the title and body mitosis wrote.
- [ ] c2 Every confirmed blocker is fixed with a receipt test that failed first, or named at the top of a draft pull request after a diagnosis classed it blocked.

## Where things stand

Not started.

## Next step

Cut the FEATURE branch with pipeline feature-branch --type feat, write the run home, run --plan-only, then the first build.

Needs: D1.

## Decisions in force

- D1 Interphase hand-off: build the spec as handed off: Build the two Steps as handed off on the FEATURE branch; any later gap is filled from the Intent lines and recorded as an assumption.

## Open risks

## Settled, do not reopen

## Where the details live

- Spec: /Users/satanshumishra/Documents/DevLabs/.windful-ocean/docs/specs/refuse-unanswerable-prompts.md
- Decisions: /Users/satanshumishra/Documents/DevLabs/.windful-ocean/docs/specs/refuse-unanswerable-prompts.decisions.md
- Record: /Users/satanshumishra/Documents/DevLabs/.windful-ocean/docs/specs/refuse-unanswerable-prompts.record.json
- Run home: ~/.mitosis/.windful-ocean/refuse-unanswerable-prompts/
- Mitosis run dir: ~/.mitosis/runs/.windful-ocean/refuse-unanswerable-prompts
