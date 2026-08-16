---
Status: accepted
Date: 2026-08-16T06:47:09.279Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0463. The remaining MSPs ship as one linear stack, with the main fold placed below D3

## Context

Merging is denied to the agent on every path: Bash(gh pr merge) and the GitHub MCP merge_pull_request are in settings.json permissions.deny, and block-destructive-bash.sh:120-123 additionally blocks the gh api pulls/*/merge REST endpoint and the mergePullRequest, enablePullRequestAutomerge and enqueuePullRequest GraphQL mutations. git merge --no-ff is allowed, so landing MSPs on the stack base by local merge and push is technically open, and decision 0415 set a precedent for a direct push to the base. The user declined that route for this run. Separately the base is 265 ahead of and 56 behind origin/main, and the release gate at criterion c7 cannot resolve until that gap closes. Remaining units are D2a, D2b, c23, c4, the main fold and D3. Running them as parallel siblings off the base would surface every conflict at merge time, unattended, with nobody available to resolve it.

## Options

- Land each green MSP on the stack base by local git merge --no-ff and push
- Run the remaining units as parallel siblings off the base and reconcile at merge
- Ship one linear stack of pull requests, each branched off the previous, and leave the merges to a human

## Outcome

One linear stack, each MSP branched off the previous and each independently green: base, then D2a, D2b, c23, c4, the main fold, D3. Nothing merges tonight and nothing reaches main. Linear rather than parallel because an unattended conflict has no resolver. The main fold is placed second from the top, BELOW D3 rather than at the bottom: D3 must measure the branch that will actually merge to main, so the 56-commit gap closes before measurement rather than after, and placing it at the bottom would require rebasing D2a while it was already in flight. A merge runbook ships with the stack, because the stacked-merge trap in 0445 is live here — GitHub retargets a child onto the trunk ONLY when its base branch is DELETED, so each parent branch must be deleted and its ref confirmed gone before its child is merged.
