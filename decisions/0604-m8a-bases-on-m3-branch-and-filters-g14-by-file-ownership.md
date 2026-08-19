---
Status: accepted
Date: 2026-08-19T00:51:45.926Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0604. M8a bases on M3's branch, merges its other three parents in, and reads G14 survivors only in its own files

## Context

Wave 4 (M8a) depends on M0 (#219), M7 (#224 on #219), M3 (#227 on #222) and M12b-2 (#230 on #222+#221). All ten stack PRs are open and human-gated on 2026-08-19. Under 0602 a second open parent enters by merge commit; here there are four. Any base leaves the other parents' content in the two-dot enforcer diff, so foreign G14 survivors (M3 already carries 7) would block M8a's receipts by construction. Waves 4-9 are serial, so waiting for merges costs wall-clock on the critical path; the RUNBOOK forbids waiting.

## Options

- Wait for the human to merge all ten PRs before dispatching M8a - clean diff, but the wave waits on a human
- Base on M7's branch (closest by subject) and merge in #227 and #230 - diff carries M2 and M3 production lines with known G14 survivors
- Base on M3's branch #227 (carries M2) and merge in #224 (carries #219) and #230 (carries #221) - foreign diff is mostly tests and deletions; treat G14 survivors outside M8a's five files as the parents' and report them, not fix them; retarget to main once parents merge

## Outcome

Option 3. Base feat/mitosis-append-only-journal; merge commits for origin/fix/mitosis-vacuous-boundary-verdict and origin/refactor/mitosis-delete-run-engine; content proofs for all four parents. Receipts is read by ownership: a G14 survivor at a path M8a does not own is a parent's and is reported to the orchestrator, never fixed in flight; survivors in M8a's five files get the one permitted attempt. The integrate journal kind M3 descoped stays in the backlog and is NOT absorbed by M8a - M8a sits near the 400 cap and its ceiling does not require it. After all parents merge, the PR is retargeted explicitly to main (0519) and receipts re-runs on the narrowed diff.
