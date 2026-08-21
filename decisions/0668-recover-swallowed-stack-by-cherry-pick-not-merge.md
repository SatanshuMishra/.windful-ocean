---
Status: accepted
Date: 2026-08-21T23:04:10.956Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0668. A merge swallowed by a live base branch is recovered by cherry-pick, never by merging that branch

## Context

Pull request 277 was merged into feat/mitosis-cassette-loader, which was never deleted, so GitHub never retargeted it and its content never reached the trunk. The obvious repair, merging that base branch into main, would have been destructive: the branch was cut before 274, 275 and 276 landed, so it removes the preserved run evidence, the prompt side-effect test and the dispatch-record test, and restores a deleted test. Verified by content with git cat-file and a diffstat, never by a MERGED label.

## Options

- Merge the stale base branch into main
- Push new commits onto the already-merged branch
- Cut a fresh branch from main and cherry-pick only the stranded commits forward

## Outcome

Cut fix/mitosis-census-and-sweep-recovery from origin/main and cherry-picked the squash commit plus the two census fixes onto it, resolving the excluded-subdirectory array to fixtures, evidence and cassettes rather than keeping either side. The diffstat against main was asserted to touch exactly eight paths with no deletion of already-merged work before pushing. Opened as pull request 278. feat/mitosis-cassette-loader stays undeleted until 278 lands, because it is the only place that history lives.
