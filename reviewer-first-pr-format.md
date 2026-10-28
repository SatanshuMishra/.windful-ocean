# reviewer-first-pr-format: Reviewer-first PR format with one composer in the pull-request plugin
Status: parked
Updated: 2026-10-28T06:43:24.694Z
Next ids: c3 D3 R1 S1

## Goal

Make the pull-request plugin (~/Documents/DevLabs/pull-request) the only builder of PR titles and bodies, with a reviewer-first body (Problem, Change, Impact, Trade-offs and open problems, Testing, Links), no Risk/Door/Blast radius/How-to-review/AI disclosure, format-only checks, and receipts machine lines in a folded final block with their trigger words refused in human sections; mitosis, lighthouse, interphase and pipeline migrate in follow-on runs.

## Done when

- [x] c1 pull-request plugin MSP pull requests are open, assigned to the user, built through the pipeline full lane evidence: SatanshuMishra/pull-request#5 is open, ready for review, assigned to SatanshuMishra, base feat/reviewer-first-pr-format, built by mitosis and reviewed green in round 1 of the full lane
- [x] c2 The final report states the facts interface mitosis and lighthouse must call evidence: the session's final report states the render --fields JSON schema and flags that mitosis and lighthouse must call

## Where things stand

Integration: the MSP pull request SatanshuMishra/pull-request#5 merged into feat/reviewer-first-pr-format, and pipeline integration-ready reports ready. lighthouse:test run 1 (results in the run home's lighthouse/run-1) tests feat/reviewer-first-pr-format against main and opens the FEATURE pull request on green.

## Next step

Read lighthouse run 1's last JSON line; on green report the FEATURE pull request and park the thread for Clean-up, otherwise record each failure as a finding and run the integration fix round.

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
- Lighthouse profile: ~/Documents/DevLabs/pull-request/.lighthouse/profile.json (untracked)
