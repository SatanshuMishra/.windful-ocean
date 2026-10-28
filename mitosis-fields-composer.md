# mitosis-fields-composer: Mitosis commits one Step at a time and hands pull-request facts to render --fields
Status: active
Updated: 2026-10-28T08:47:50.345Z
Next ids: c3 D2 R2 S1

## Goal

In ~/Documents/DevLabs/mitosis, make mitosis commit once per Step instead of once per Lane, and replace its own pull-request title and body composer in run.py with a facts file handed to pull-request render --fields, so the pull-request plugin is the only composer.

## Done when

- [ ] c1 mitosis MSP pull requests are open, assigned to the user, built through the pipeline full lane
- [ ] c2 mitosis no longer holds its own pull-request body or title composer and opens bodies render --fields printed

## Where things stand

Review round 1 on MSP branch mitosis/step-commits-render-fields (head 2d5d334, one commit per Step) is recorded with outcome diagnose: blockers U1, U2 (kind failing test, tests/test_metrics_run.py) and C3 (kind preflight ignores resume state, mitosis.py refuse_unrenderable); advisories C5 (commit type ignores --pr-type without a subject), C6 (duplicated prefix and folded-row formatting) and S2 (probe without a time limit). Two Opus diagnosis agents are running, one per kind. The glossary terms and ADRs 0004 and 0005 sit uncommitted in the checkout and ship with the MSP pull request.

## Next step

When both diagnoses return, save each as review/round-1/step-commits-render-fields.<kind slug>.diagnosis.json, record it with pipeline diagnosis, rerun pipeline verdict, then fix each fixable kind and the three advisories on the MSP branch with receipt tests.

Needs: D1.

## Decisions in force

- D1 Interphase hand-off: build step-commits-render-fields as one MSP of five Steps: Build now as one MSP with mitosis 0.7.0; the over-budget notes are estimates from large existing test files and each Step is already alone in its session.

## Open risks

- R1 Criterion 5.9 (live render of the real facts) stays unproven until SatanshuMishra/pull-request#6 merges and pull-request 0.3.0 is installed; the mitosis PR must not merge before it. Bears on c2.

## Settled, do not reopen

## Where the details live

- Repository: ~/Documents/DevLabs/mitosis
- Depends on: pull-request 0.3.0 render --fields, FEATURE pull request SatanshuMishra/pull-request#6 (thread reviewer-first-pr-format)
- Spec, decisions, record, items: ~/Documents/DevLabs/mitosis/docs/specs/step-commits-render-fields.{md,decisions.md,record.json,items.json}
- Record generator: session scratchpad make_record_mitosis.py and mitosis-spec-template.md
- Run home: ~/.mitosis/mitosis/step-commits-render-fields/ (run.zsh and its inputs, rounds.md, build output)
- Mitosis run directory: ~/.mitosis/runs/mitosis/step-commits-render-fields
- Promoted at hand-off: ~/Documents/DevLabs/mitosis/GLOSSARY.md (Pull requests section) and docs/adr/0004, 0005
- Review round 1: run home review/round-1/ (diff, suite.txt, reviewer briefs, suite-findings.json); obligations and assumptions in run home review/
