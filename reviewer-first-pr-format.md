# reviewer-first-pr-format: Reviewer-first PR format with one composer in the pull-request plugin
Status: active
Updated: 2026-10-28T05:38:03.793Z
Next ids: c3 D1 R1 S1

## Goal

Make the pull-request plugin (~/Documents/DevLabs/pull-request) the only builder of PR titles and bodies, with a reviewer-first body (Problem, Change, Impact, Trade-offs and open problems, Testing, Links), no Risk/Door/Blast radius/How-to-review/AI disclosure, format-only checks, and receipts machine lines in a folded final block with their trigger words refused in human sections; mitosis, lighthouse, interphase and pipeline migrate in follow-on runs.

## Done when

- [ ] c1 pull-request plugin MSP pull requests are open, assigned to the user, built through the pipeline full lane
- [ ] c2 The final report states the facts interface mitosis and lighthouse must call

## Where things stand

Interphase spec slug reviewer-first-pr-format is written and passes check_spec and check_items (5 Steps, one MSP reviewer-first-format); its one spec review is running.

## Next step

Fix the spec reviewer's issues once, re-render and re-check, then run interphase Phase 10 hand-off and start pipeline Stage 2 (pipeline feature-branch, receipts config commit, run.zsh --plan-only).

## Decisions in force

## Open risks

## Settled, do not reopen

## Where the details live

- Repository: ~/Documents/DevLabs/pull-request (thread kept in the .windful-ocean logbook because the session's primary folder could not move)
- Evidence: 100-PR review in session scratchpad prs/prs.json; receipts enforcer verify.js lines 153, 464, 466, 581
