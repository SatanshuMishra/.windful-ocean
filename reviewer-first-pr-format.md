# reviewer-first-pr-format: Reviewer-first PR format with one composer in the pull-request plugin
Status: active
Updated: 2026-10-28T06:10:04.179Z
Next ids: c3 D2 R1 S1

## Goal

Make the pull-request plugin (~/Documents/DevLabs/pull-request) the only builder of PR titles and bodies, with a reviewer-first body (Problem, Change, Impact, Trade-offs and open problems, Testing, Links), no Risk/Door/Blast radius/How-to-review/AI disclosure, format-only checks, and receipts machine lines in a folded final block with their trigger words refused in human sections; mitosis, lighthouse, interphase and pipeline migrate in follow-on runs.

## Done when

- [ ] c1 pull-request plugin MSP pull requests are open, assigned to the user, built through the pipeline full lane
- [ ] c2 The final report states the facts interface mitosis and lighthouse must call

## Where things stand

MSP reviewer-first-format is committed and held on branch mitosis/reviewer-first-format at 1e0215d (gate: 37 pass, 1 inert; suite 277 OK on 3.14 and 3.9; 38 proofs recorded). Round 1 review: conformance-auditor returned all nine criteria MET with no finding (saved as review/round-1/raw/conformance.json); code-reviewer and security-reviewer are running. GLOSSARY.md and docs/adr/0001-0004 sit untracked in the checkout and ship with the pull request.

## Next step

When the three round 1 reviewers return, collect their arrays into review/round-1/reviewer-first-format.findings.json, then run pipeline candidates, the validator if needed, pipeline record and pipeline verdict.

Needs: D1.

## Decisions in force

- D1 Interphase hand-off: build the reviewer-first spec as one MSP of five Steps: Build now as one MSP; gate is ordered before cli-and-skill so no gate test depends on render's flags.

## Open risks

## Settled, do not reopen

## Where the details live

- Repository: ~/Documents/DevLabs/pull-request (thread kept in the .windful-ocean logbook because the session's primary folder could not move)
- Evidence: 100-PR review in session scratchpad prs/prs.json; receipts enforcer verify.js lines 153, 464, 466, 581
- Spec, decisions, record, items: ~/Documents/DevLabs/pull-request/docs/specs/reviewer-first-pr-format.{md,decisions.md,record.json,items.json}
- Run home: ~/.mitosis/pull-request/reviewer-first-pr-format/ (run.zsh and its inputs, rounds.md, build-1.out and build-1.err)
- Mitosis run directory: ~/.mitosis/runs/pull-request/reviewer-first-pr-format
- Lighthouse profile: ~/Documents/DevLabs/pull-request/.lighthouse/profile.json (untracked)
