# mitosis-fields-composer: Mitosis commits one Step at a time and hands pull-request facts to render --fields
Status: active
Updated: 2026-10-28T07:44:26.442Z
Next ids: c3 D2 R2 S1

## Goal

In ~/Documents/DevLabs/mitosis, make mitosis commit once per Step instead of once per Lane, and replace its own pull-request title and body composer in run.py with a facts file handed to pull-request render --fields, so the pull-request plugin is the only composer.

## Done when

- [ ] c1 mitosis MSP pull requests are open, assigned to the user, built through the pipeline full lane
- [ ] c2 mitosis no longer holds its own pull-request body or title composer and opens bodies render --fields printed

## Where things stand

The spec is handed off (five Steps in one MSP); the first build is running in the background on FEATURE branch feat/step-commits-render-fields, writing build-1.out and build-1.err in the run home. The glossary terms and ADRs 0004 and 0005 sit uncommitted in the checkout and ship with the MSP pull request.

## Next step

When the build finishes, read build-1.out's last line, then run review round 1 on its committed MSP.

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
