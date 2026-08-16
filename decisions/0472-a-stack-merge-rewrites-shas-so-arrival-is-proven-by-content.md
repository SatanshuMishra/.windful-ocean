---
Status: accepted
Date: 2026-08-16T17:38:28.883Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0472. A GitHub stack merge rewrites commits, so arrival is proven by content rather than by SHA ancestry

## Context

The six-PR stack could not be merged with the ordinary mutation. GitHub refused with "This pull request is part of a stack and must be merged using the asynchronous merge REST API", and the merge that succeeded rewrote the commits. PR #143's recorded head became fb7febde where the branch tip had been c546ebb5, so the ancestry assertion the merge runbook specified, git merge-base --is-ancestor c546ebb5 origin/feat/mitosis-os-process, returns NO on a stack that merged perfectly. The runbook had been written around 0445, whose lesson is the opposite failure: a child merged into a still-live parent branch reports MERGED while its content never reaches the trunk. Both failure modes present as a mismatch between a MERGED status and an ancestry check, and they demand opposite conclusions. Separately, all six branches survived the merge because the delete-branch flag did not fire, which under 0445 would normally be the alarming case.

## Options

- Trust the MERGED status on all six pull requests
- Treat the failed ancestry assertion on c546ebb5 as a lost merge and re-merge
- Prove arrival by asserting the content itself is present on the base

## Outcome

Prove arrival by CONTENT. Assert that the files and symbols each unit introduced are present at the base ref, and that every path the stack deleted is still absent, rather than asserting a pre-merge SHA is an ancestor. Ancestry by SHA is only valid when the merge preserves commit identity; a squash or a stack merge breaks it while losing nothing. The content assertion is valid under every merge strategy, which makes it the general instrument and SHA ancestry the special case. Verified on the merged base: the D3 report, the usage-envelope seam tests, the gate red cases, the dispatch-failure report, recordUsage in run-store and the envelope in pool.mjs are all present; workflows/mitosis.js, workflow-sandbox.mjs, mirror-guard.test.mjs and dead-export-lint.test.mjs are all still absent; and origin/main is an ancestor, so the M1 fold survived. This supersedes the runbook's ancestry step for any stack or squash merge, and it does not weaken 0445 — the deletion-and-retarget discipline still governs merge ORDER, while content assertion governs the proof of arrival.
