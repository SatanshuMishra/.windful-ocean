---
Status: accepted
Date: 2026-07-27T22:34:08.078Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0046. Section 6 applies to both PR-gating workflows, with no skip guard

## Context

Decision 0045 directed applying runbook Section 6 to "the PR-gating workflow", and the thread carried a standing risk not to assume security.yml was the only one. Live inspection found the bare `on: pull_request:` hazard on TWO workflows: security.yml (whose sast job derives its semgrep diff baseline from github.event.pull_request.base.sha at line 35 -- the exact value a retarget changes) and test.yml (which runs npm test against the PR merge ref, also changed by a new base). labeler.yml is a third workflow but triggers on pull_request_target and only applies labels. Separately, adding `edited` means full CI re-runs on every PR title or body edit, not only on retarget, which raises the question of a skip guard.

## Options

- security.yml only, per the narrowest literal reading of 0045
- Both security.yml and test.yml, since both compute results that a base change invalidates (CHOSEN)
- All three workflows including labeler.yml
- Both gating workflows plus a job-level `if:` guard skipping runs when github.event.changes.base is absent, to avoid re-running CI on title/body edits

## Outcome

Applied to both security.yml and test.yml, unguarded. labeler.yml excluded: it is not a merge gate, and widening a pull_request_target trigger enlarges the write-token attack surface for no gating benefit. The `if:` guard was rejected on Quality-over-Optimization grounds: a skipped job reports as successful to a required-status-check gate, so a mis-specified guard would silently reintroduce the exact stale-green failure the fix closes -- and the runbook itself marks the nested `changes.base` payload key names `[unverified]`, so the guard would rest on the one fact that is not docs-verified. Extra CI runs on title/body edits are the accepted price. Implementation note carried forward: specifying `types:` REPLACES the default set, so opened/synchronize/reopened are re-listed explicitly; a list containing only `edited` would silently disable normal PR CI. Shipped as PR #7 (commit 9b3f28b), suite green at 1347 tests, 0 fail.
