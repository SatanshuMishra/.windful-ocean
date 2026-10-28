# mitosis-fields-composer: Mitosis commits one Step at a time and hands pull-request facts to render --fields
Status: parked
Updated: 2026-10-28T19:52:48.315Z
Next ids: c3 D3 R2 S1

## Goal

In ~/Documents/DevLabs/mitosis, make mitosis commit once per Step instead of once per Lane, and replace its own pull-request title and body composer in run.py with a facts file handed to pull-request render --fields, so the pull-request plugin is the only composer.

## Done when

- [x] c1 mitosis MSP pull requests are open, assigned to the user, built through the pipeline full lane evidence: SatanshuMishra/mitosis#25 opened through create_pull_request, assigned to SatanshuMishra, after review rounds 1 and 2 (green)
- [x] c2 mitosis no longer holds its own pull-request body or title composer and opens bodies render --fields printed evidence: lighthouse run 1 green: the old composer and its checks are gone on feat/step-commits-render-fields, and with the real pull-request 0.3.0 renderer mitosis shipped bodies byte-identical to what render --fields printed, which the format hook accepted (run home lighthouse/run-1/report.md)

## Where things stand

Integration is green: FEATURE pull request SatanshuMishra/mitosis#26 (feat/step-commits-render-fields into main) is open and waits on the user's merge. Pull-request 0.3.0 is merged but not installed here (the plugin cache holds 0.2.0), so installed mitosis runs refuse at the render probe until it is. The checkout's uncommitted Referee and gate glossary section and ADRs 0006-0008 belong to another run.

## Next step

Run pipeline integration-ready for slug step-commits-render-fields, then lighthouse:test run 1 with --core main, --feature feat/step-commits-render-fields, the spec, and --results run home lighthouse/run-1; it opens the FEATURE pull request on green.

Needs: D2, R1.

## Decisions in force

- D1 Interphase hand-off: build step-commits-render-fields as one MSP of five Steps: Build now as one MSP with mitosis 0.7.0; the over-budget notes are estimates from large existing test files and each Step is already alone in its session.
- D2 Ship: open step-commits-render-fields ready for review at 0671ed3: Ship now, ready for review, with proven head 0671ed3, base feat/step-commits-render-fields. The report states that this pull request must not merge before SatanshuMishra/pull-request#6.

## Open risks


## Settled, do not reopen

## Where the details live

- Repository: ~/Documents/DevLabs/mitosis
- Depends on: pull-request 0.3.0 render --fields, FEATURE pull request SatanshuMishra/pull-request#6 (thread reviewer-first-pr-format)
- Spec, decisions, record, items: ~/Documents/DevLabs/mitosis/docs/specs/step-commits-render-fields.{md,decisions.md,record.json,items.json}
- Record generator: session scratchpad make_record_mitosis.py and mitosis-spec-template.md
- Run home: ~/.mitosis/mitosis/step-commits-render-fields/ (run.zsh and its inputs, rounds.md, build output)
- Mitosis run directory: ~/.mitosis/runs/mitosis/step-commits-render-fields
- Promoted at hand-off: ~/Documents/DevLabs/mitosis/GLOSSARY.md (Pull requests section) and docs/adr/0004, 0005
- Review rounds: run home review/round-<n>/ (diff, suite.txt, briefs, reviewer arrays, findings, candidates, verdicts, diagnoses); obligations and assumptions in run home review/
