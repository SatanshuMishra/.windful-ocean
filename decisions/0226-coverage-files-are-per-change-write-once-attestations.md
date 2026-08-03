---
Status: accepted
Date: 2026-08-03T19:29:00.105Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0226. Invariant coverage files are per-change write-once attestations, never retroactively edited

## Context

Commit 106b253 satisfied the PR-mode coverage gate by editing one line of feat-m5-quiescent-exit.json, an OLDER change's attestation, rather than authoring its own file. The checker's pullRequestErrors (scripts/invariant-coverage-check.mjs:161-179) requires only that SOME path under docs/invariants/coverage/ changed between base and HEAD; it never checks which, so the gate went green while unmet. Reverting the edit was ordered by review, but the edited text was a CORRECTION: it updated a now-stale claim that merge-boundary-preflight.mjs was still a live production importer of merge-watch.mjs, which the deletion had just falsified. Reverting therefore appeared to restore a false sentence, which is why the ruling had to be made explicitly rather than applied mechanically.

## Options

- Keep the retroactive edit because it makes the older file factually current, and author the new file alongside it
- Revert the edit and let the older file carry a now-stale claim, recording the current fact only in the new file
- Leave both alone and treat the gate's some-file-changed behaviour as sufficient

## Outcome

Revert. A coverage file attests what a SPECIFIC change asserted at the time it shipped; it is not a live index of the tree. The reverted sentence was TRUE for the tree feat/m5-quiescent-exit attested, so restoring it restores an accurate historical record rather than introducing a false one - the same write-once discipline decision records already follow. The CURRENT fact, that merge-boundary-preflight.mjs is deleted and mitosis-git.mjs:6 is now the sole surviving production importer of merge-watch.mjs, lands in the new file's B6 row, so the revert loses no information. Verified byte-exact: git diff 106b253^ -- docs/invariants/coverage/feat-m5-quiescent-exit.json is empty. Corollaries for future changes: every change authors its own file named for its branch with the / replaced by -, carrying a row for ALL 12 registry ids (validateCoverageEntry re-validates every file in the directory on every run, so a partial file reddens the whole job); and the checker's which-file blindness is a KNOWN standing hole that this change repaired by hand rather than closed - a future change can still satisfy the gate by touching any historical entry.
