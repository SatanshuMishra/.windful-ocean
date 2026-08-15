---
Status: accepted
Date: 2026-08-15T20:02:52.982Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0443. C5b collapses to its net diff while C6 replays granularly

## Context

The restack of C5b onto the cleaned base aec7d253 conflicted on the first of its 11 commits. Measurement then showed C5b's net diff touches only three files (+68/-9) and its overlap with everything the base changed since 6b72e7ab is EMPTY: every conflict sat in gate scaffolding that C5b itself retires in its own commits 10 and 11, having added it in commit 1. C6 has the same add-then-retire shape on its gate registration, but its net is 3744 surviving lines across 11 brand-new boundary modules. Replaying both branches granularly meant roughly 31 conflict resolutions inside apparatus that both branches delete, each one an opportunity for the wholesale-resolution silent drop already carried as a risk. No pull requests were open at the time, so no review thread was anchored to commit granularity. C5a needed no work at all: every commit on it was already an ancestor of the base.

## Options

- Replay all 32 commits granularly and resolve the roughly 31 conflicts
- Collapse both branches to their net diffs as one commit each
- Collapse C5b, replay C6 granularly - chosen

## Outcome

C5b ships as one commit 15993c20 carrying its three-file net diff, verified byte-identical to the pre-restack diff at 143 lines, 185 tests green. C6 replays all 20 commits to 82a8d2fe with author, email, date and subject preserved on every one, its 11 boundary files byte-identical to their originals at 3803 diff lines, 230 tests green. PR #121 (C5b onto the base) and PR #122 (C6 onto C5b) are open and MERGEABLE. The split follows what survives a branch rather than how many commits it has: C5b's verb and specimen apparatus were built and retired inside the branch leaving 68 lines, so its intermediate history documents apparatus that no longer exists, while C6's 3744 lines survive and their history carries real forensic value. Both prior tips, 62200593 and 7d98a98a, remain recoverable.
