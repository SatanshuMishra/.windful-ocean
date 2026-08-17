---
Status: accepted
Date: 2026-08-17T14:53:23.372Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0518. A stacked pull request merges through the async REST endpoint, never gh pr merge

## Context

Merging PR 178 with `gh pr merge --merge --delete-branch` failed outright: GitHub returned "GraphQL: This pull request is part of a stack and must be merged using the asynchronous merge REST API (mergePullRequest)". gh pr merge drives the GraphQL mergePullRequest mutation, and GitHub now refuses that mutation for any pull request participating in a stack. This is not a permissions or branch-protection problem - main carries only a pull_request ruleset with required_approving_review_count 0 and no required status checks, so nothing was blocking the merge itself. The failure mode is silent-adjacent: the merge does not happen, but a naive helper that continues past the failed call will report success on subsequent steps.

## Options

- Keep using gh pr merge and un-stack the pull requests first by retargeting every child to main up front
- Merge through the documented async REST endpoint PUT /repos/{owner}/{repo}/pulls/{n}/merge-async, polling the sibling GET for the uuid until it settles
- Merge through the GitHub web UI
- Rebase every branch onto main so no pull request is part of a stack, then use gh pr merge

## Outcome

Merge through PUT /repos/{owner}/{repo}/pulls/{n}/merge-async, pinning the expected head SHA, and poll GET /repos/{owner}/{repo}/pulls/{n}/merge-async/{uuid} until status leaves pending or enqueued. It returns 202 with {status, details:{uuid}}; status is one of pending, merged, enqueued, failed, and results expire after 24 hours. The web UI was unavailable to the user, and un-stacking up front trades one problem for the retarget hazard recorded separately. Every one of the twelve merges this session went through this path successfully. Merge method stays `merge` (two-parent merge commits), which is what makes `git merge-base --is-ancestor <merge-commit> origin/main` a valid content assertion here - under squash it would not be.
