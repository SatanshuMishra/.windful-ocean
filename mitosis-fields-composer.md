# mitosis-fields-composer: Mitosis commits one Step at a time and hands pull-request facts to render --fields
Status: active
Updated: 2026-10-28T09:21:50.544Z
Next ids: c3 D2 R2 S1

## Goal

In ~/Documents/DevLabs/mitosis, make mitosis commit once per Step instead of once per Lane, and replace its own pull-request title and body composer in run.py with a facts file handed to pull-request render --fields, so the pull-request plugin is the only composer.

## Done when

- [ ] c1 mitosis MSP pull requests are open, assigned to the user, built through the pipeline full lane
- [ ] c2 mitosis no longer holds its own pull-request body or title composer and opens bodies render --fields printed

## Where things stand

Review is green at round 2; its advisories are fixed on MSP branch mitosis/step-commits-render-fields, C8 at d6eca6d and C7 at 1737b9e (head), with the full suite passing on Python 3.14 and 3.9 (569 tests). The glossary's Pull requests section and ADRs 0004 and 0005 are committed on the MSP branch at 0671ed3 (head); the checkout's other uncommitted glossary section and ADRs 0006-0008 belong to another run and are not shipped here. The run is at Ship.

## Next step

Ship: commit the glossary and ADRs 0004 and 0005 on the MSP branch, write the review comment with pipeline comment, run pipeline promote, record the ship decision, run SHIP=1 run.zsh --resume with the proven head, then open, assign and comment the pull request and park the thread.

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
- Review rounds: run home review/round-<n>/ (diff, suite.txt, briefs, reviewer arrays, findings, candidates, verdicts, diagnoses); obligations and assumptions in run home review/
