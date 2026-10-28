# reviewer-first-pr-format: Reviewer-first PR format with one composer in the pull-request plugin
Status: active
Updated: 2026-10-28T05:47:03.233Z
Next ids: c3 D2 R1 S1

## Goal

Make the pull-request plugin (~/Documents/DevLabs/pull-request) the only builder of PR titles and bodies, with a reviewer-first body (Problem, Change, Impact, Trade-offs and open problems, Testing, Links), no Risk/Door/Blast radius/How-to-review/AI disclosure, format-only checks, and receipts machine lines in a folded final block with their trigger words refused in human sections; mitosis, lighthouse, interphase and pipeline migrate in follow-on runs.

## Done when

- [ ] c1 pull-request plugin MSP pull requests are open, assigned to the user, built through the pipeline full lane
- [ ] c2 The final report states the facts interface mitosis and lighthouse must call

## Where things stand

Interphase spec slug reviewer-first-pr-format is written and passes check_spec and check_items (5 Steps, one MSP reviewer-first-format); its one spec review is running. The run home holds CHARTER.md, worker-rules.txt, dispatch.zsh and run.zsh; items.json and graph.json are not copied yet, and run.zsh assumes the FEATURE branch is feat/reviewer-first-pr-format until pipeline feature-branch prints it.

## Next step

Cut the FEATURE branch with pipeline feature-branch, commit receipts.config.json on it through a temporary worktree, copy items.json and graph.json into the run home, then run run.zsh --plan-only and the first build.

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
