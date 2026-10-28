# reviewer-first-pr-format: Reviewer-first PR format with one composer in the pull-request plugin
Status: parked
Updated: 2026-10-28T07:18:36.630Z
Next ids: c3 D3 R1 S1

## Goal

Make the pull-request plugin (~/Documents/DevLabs/pull-request) the only builder of PR titles and bodies, with a reviewer-first body (Problem, Change, Impact, Trade-offs and open problems, Testing, Links), no Risk/Door/Blast radius/How-to-review/AI disclosure, format-only checks, and receipts machine lines in a folded final block with their trigger words refused in human sections; mitosis, lighthouse, interphase and pipeline migrate in follow-on runs.

## Done when

- [x] c1 pull-request plugin MSP pull requests are open, assigned to the user, built through the pipeline full lane evidence: SatanshuMishra/pull-request#5 is open, ready for review, assigned to SatanshuMishra, base feat/reviewer-first-pr-format, built by mitosis and reviewed green in round 1 of the full lane
- [x] c2 The final report states the facts interface mitosis and lighthouse must call evidence: the session's final report states the render --fields JSON schema and flags that mitosis and lighthouse must call

## Where things stand

Integration: U1 (receipts values accepted HTML), lighthouse run 1's one failure, is diagnosed fixable and fixed on the FEATURE branch with a receipt test; lighthouse run 2 retests it with --previous run-1. Run 1 also left one path flaky (skill reach) and one unproven (close, off-limits).

## Next step

The user starts Clean-up by saying FEATURE pull request SatanshuMishra/pull-request#6 merged; then resume this thread, sync, and run pipeline clean for slug reviewer-first-pr-format.

## Decisions in force

- D1 Interphase hand-off: build the reviewer-first spec as one MSP of five Steps: Build now as one MSP; gate is ordered before cli-and-skill so no gate test depends on render's flags.
- D2 Ship boundary: ship MSP reviewer-first-format as one ready pull request: Ship with SHIP=1 run.zsh --resume, gating the current head again, then open the pull request ready for review against feat/reviewer-first-pr-format.

## Open risks

## Settled, do not reopen

## Where the details live

- Repository: ~/Documents/DevLabs/pull-request (thread kept in the .windful-ocean logbook because the session's primary folder could not move)
- Evidence: 100-PR review in session scratchpad prs/prs.json; receipts enforcer verify.js lines 153, 464, 466, 581
- Spec, decisions, record, items: ~/Documents/DevLabs/pull-request/docs/specs/reviewer-first-pr-format.{md,decisions.md,record.json,items.json}
- Run home: ~/.mitosis/pull-request/reviewer-first-pr-format/ (run.zsh and its inputs, rounds.md, build-1.out and build-1.err)
- Mitosis run directory: ~/.mitosis/runs/pull-request/reviewer-first-pr-format
- Lighthouse profile: committed on feat/reviewer-first-pr-format as .lighthouse/profile.json
- Integration worktree: ~/.mitosis/runs/pull-request/reviewer-first-pr-format/integration (FEATURE branch)
- Lighthouse results: run home's lighthouse/run-<k>; integration findings in review/round-<k>/integration.*
