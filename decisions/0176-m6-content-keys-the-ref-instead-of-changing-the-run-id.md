---
Status: accepted
Date: 2026-08-01T04:33:06.445Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0176. M6 content-keys the manifest ref rather than changing computeLogicalRunId

## Context

Spec 3.5's write-once clause asserts "a decompose that changes the MSP table is a different run and therefore a different logicalRunId and a different ref". That is FALSE in the code: computeLogicalRunId hashes the spec PATH and baseBranch, never spec content. The consequence found in review was severe - the first in-place spec edit re-decomposes a different MSP table under the same runId, hits the write-once alreadyPresent STOP, and pins that run to identity local-only PERMANENTLY with no repair path.

## Options

- Fold specContentHash into computeLogicalRunId so the id itself changes
- Content-key the manifest ref only, leaving computeLogicalRunId untouched
- Amend the spec to accept the dead end as a reported limitation
- Add a supersede/reap path for stale manifest refs

## Outcome

Content-key the REF only: refs/mitosis-manifest/<logicalRunId>/<specContentHash>. What the clause needs for correctness is a different REF, and that is achievable without touching run-id derivation - which would orphan every refs/mitosis/<runId>/<unitId> checkpoint, defeat evaluateManifestReuse, and reach the section 9 resurrection guard that is out of scope. Each spec revision now owns its own write-once ref, so a spec edit publishes fresh instead of dead-ending. Write-once/forward-only holds per ref. Accepted residual: a superseded ref is never reaped. Spec 3.5 amended in e516fc9 to record this rather than leaving the false clause standing. The stale-hash refusal in resolveRunIdentity is retained, reworded as an INTEGRITY check (payload disagreeing with its own ref path), defense in depth.
