# mitosis-fields-composer: Mitosis commits one Step at a time and hands pull-request facts to render --fields
Status: active
Updated: 2026-10-28T07:28:27.016Z
Next ids: c3 D1 R1 S1

## Goal

In ~/Documents/DevLabs/mitosis, make mitosis commit once per Step instead of once per Lane, and replace its own pull-request title and body composer in run.py with a facts file handed to pull-request render --fields, so the pull-request plugin is the only composer.

## Done when

- [ ] c1 mitosis MSP pull requests are open, assigned to the user, built through the pipeline full lane
- [ ] c2 mitosis no longer holds its own pull-request body or title composer and opens bodies render --fields printed

## Where things stand

Interphase (unattended, slug step-commits-render-fields) wrote the spec, record and items: five Steps in one MSP; the one spec review is running. Readiness had nothing open and mitosis already commits receipts.config.json.

## Next step

Fix the spec review's real issues once, rerun render_record and the checks, finish interphase Phase 10, then start Stage 2.

## Decisions in force

## Open risks

## Settled, do not reopen

## Where the details live

- Repository: ~/Documents/DevLabs/mitosis
- Depends on: pull-request 0.3.0 render --fields, FEATURE pull request SatanshuMishra/pull-request#6 (thread reviewer-first-pr-format)
- Spec, decisions, record, items: ~/Documents/DevLabs/mitosis/docs/specs/step-commits-render-fields.{md,decisions.md,record.json,items.json}
- Record generator: session scratchpad make_record_mitosis.py and mitosis-spec-template.md
