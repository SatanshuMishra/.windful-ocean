# reviewer-first-pr-format: Reviewer-first PR format with one composer in the pull-request plugin
Status: active
Updated: 2026-10-28T05:47:45.557Z
Next ids: c3 D2 R1 S1

## Goal

Make the pull-request plugin (~/Documents/DevLabs/pull-request) the only builder of PR titles and bodies, with a reviewer-first body (Problem, Change, Impact, Trade-offs and open problems, Testing, Links), no Risk/Door/Blast radius/How-to-review/AI disclosure, format-only checks, and receipts machine lines in a folded final block with their trigger words refused in human sections; mitosis, lighthouse, interphase and pipeline migrate in follow-on runs.

## Done when

- [ ] c1 pull-request plugin MSP pull requests are open, assigned to the user, built through the pipeline full lane
- [ ] c2 The final report states the facts interface mitosis and lighthouse must call

## Where things stand

The mitosis build of MSP reviewer-first-format (plan 2cdc91b412ef, 5 Steps in 4 Lanes) is running in the background on FEATURE branch feat/reviewer-first-pr-format, which holds the receipts config commit. The spec is handed off; GLOSSARY.md and docs/adr/0001-0004 sit untracked in the checkout and ship with the pull request.

## Next step

When the build's JSON result arrives, write lane notes' assumptions to review/reviewer-first-format.assumptions.txt and start Stage 3 round 1 review of MSP reviewer-first-format.

Needs: D1.

## Decisions in force

- D1 Interphase hand-off: build the reviewer-first spec as one MSP of five Steps: Build now as one MSP; gate is ordered before cli-and-skill so no gate test depends on render's flags.

## Open risks

## Settled, do not reopen

## Where the details live

- Repository: ~/Documents/DevLabs/pull-request (thread kept in the .windful-ocean logbook because the session's primary folder could not move)
- Evidence: 100-PR review in session scratchpad prs/prs.json; receipts enforcer verify.js lines 153, 464, 466, 581
- Spec, decisions, record, items: ~/Documents/DevLabs/pull-request/docs/specs/reviewer-first-pr-format.{md,decisions.md,record.json,items.json}
- Run home: ~/.mitosis/pull-request/reviewer-first-pr-format/ (receipts-answers.json, CHARTER.md, worker-rules.txt, dispatch.zsh, run.zsh)
- Lighthouse profile: ~/Documents/DevLabs/pull-request/.lighthouse/profile.json (untracked)
