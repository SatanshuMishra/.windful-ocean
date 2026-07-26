---
Status: accepted
Date: 2026-07-26T22:14:05.706Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0019. The preflight decision record was LOST to the 0017 numbering collision and is restored here verbatim-in-substance from three surviving sources

## Context

The 2026-07-26 session recorded TWO decisions and the server assigned BOTH the number 0017. The session log asserts "both files exist and are distinct by slug". That assertion is FALSE. Only decisions/0017-restack-driver-ships-as-a-mitosis-git-mjs-verb-because-mitosis-js-cannot-exec.md is on disk; the preflight record was clobbered by the second write and no file bearing its slug exists anywhere in the ledger store. A grep of the whole ledger worktree for "preflight" returns the restack record, two session logs, and two thread files - never its own record. The decision itself is NOT lost, because it is recoverable from three independent surviving sources: (1) the thread spine's key_decisions entry, whose slug states the ruling outright - "0017-preflight-verifies-only-what-metadata-read-proves-bypass-emptiness-is-human-governance"; (2) Section 7 of docs/superpowers/specs/2026-07-26-mitosis-merge-boundary-runbook.md, committed at a0bb6e1, which carries the full field-path contract and the naming trap; (3) the 2026-07-26T22-05-50Z session log, which records the structural finding that produced it. Every anchor the surviving 0017 record cites was re-verified against live code this session and all still hold: fatalReport at mitosis.js:121, the seat at 3625-3631, reconcileShippedSet at 334, runReconcileOnlyAdvance at 2884, and the four merge-base --is-ancestor sites at 1175, 2971, 4452, 4593.

## Options

- Restore the ruling as a new numbered record citing its three surviving sources - CHOSEN
- Leave the gap and rely on the thread spine's key_decisions slug alone - REJECTED: the spine is a compressed pointer that a future ledgerize pass can rewrite, and the ruling is load-bearing for a build that is being implemented right now
- Rewrite the surviving 0017 file to carry both decisions - REJECTED: decision records are write-once after acceptance; only the Status line may change

## Outcome

RESTORED. The lost ruling is: the boundary preflight verifies ONLY what a Metadata:read-scoped token can positively prove, and bypass-list emptiness is HUMAN GOVERNANCE, not an engine gate. Concretely, three gated invariants: .permissions.admin strictly false, an ACTIVE branch ruleset, and a pull_request rule whose required_approving_review_count is an integer >= 1. bypass_actors is NEVER read and its ABSENCE is NEVER treated as proof of emptiness - GitHub withholds the key from any caller lacking ruleset WRITE access, so absent and empty-[] are indistinguishable to the engine's identity, and granting the access that would disambiguate them would also let the engine delete its own ruleset. The preflight therefore always reports bypassVerified=false with a fixed gap string, and that flag does NOT block the run. This resolves the runbook's Section 7 OPEN DECISION in favour of option (i) - accept a permanent verification gap covered by the human check at ruleset-creation time - and rejects (ii) a second ruleset-write credential and (iii) a human-run out-of-band check. TWO INTEGRITY NOTES FOR THE FUTURE. First, the server's decision numbering collided silently and destroyed a record; treat decision numbers as untrustworthy and disambiguate by slug, and verify a record exists on disk after writing it. Second, this restoration is a RECONSTRUCTION from the three cited sources, not the original bytes - it is faithful to the ruling and to every field path, but any wording nuance of the original is gone.
