# mitosis-fields-composer: Mitosis commits one Step at a time and hands pull-request facts to render --fields
Status: active
Updated: 2026-10-28T07:19:05.358Z
Next ids: c3 D1 R1 S1

## Goal

In ~/Documents/DevLabs/mitosis, make mitosis commit once per Step instead of once per Lane, and replace its own pull-request title and body composer in run.py with a facts file handed to pull-request render --fields, so the pull-request plugin is the only composer.

## Done when

- [ ] c1 mitosis MSP pull requests are open, assigned to the user, built through the pipeline full lane
- [ ] c2 mitosis no longer holds its own pull-request body or title composer and opens bodies render --fields printed

## Where things stand

Not started.

## Next step

Run the readiness and receipts gates for ~/Documents/DevLabs/mitosis, then invoke interphase:feature for the request.

## Decisions in force

## Open risks

## Settled, do not reopen

## Where the details live

- Repository: ~/Documents/DevLabs/mitosis
- Depends on: pull-request 0.3.0 render --fields, FEATURE pull request SatanshuMishra/pull-request#6 (thread reviewer-first-pr-format)
