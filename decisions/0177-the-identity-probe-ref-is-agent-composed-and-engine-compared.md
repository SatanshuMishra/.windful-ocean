---
Status: accepted
Date: 2026-08-01T04:33:19.879Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0177. The identity probe ref is agent-composed, engine-re-derived, and compared

## Context

Content-keying the ref (0176) hit an ordering inversion found by an implementer that changed nothing and returned honestly at ~85% context. The engine composes manifestRef at mitosis.js:3959-3961 and bakes it into the reconcile prompt's step 8, but observedSpecHash does not exist until :4021, arriving from that same agent's step 4 shasum. The engine has no shell of its own, so publishedManifestRef(runId, specContentHash) cannot be called at the composition site, and 0176's own fail-closed rule forbids fabricating a ref from an absent hash.

## Options

- Have the engine compose the full ref later, after reconcile returns, in a second dispatch
- Engine composes the ref PREFIX; the agent appends its step-4 hash and reports what it probed; the engine re-derives and compares
- Give the engine its own shell to compute the hash
- Abandon content-keying and accept the permanent local-only dead end

## Outcome

The engine composes only the ref PREFIX (which needs runId alone) into the prompt. The reconcile agent appends the hash it computed in step 4, probes the full ref, and reports the exact ref string it probed in a new RECONCILE_SCHEMA field publishedManifestRefProbed. After reconcile returns, the engine re-derives publishedManifestRef(logicalRunId, observedSpecHash) and COMPARES. Any mismatch, or a null probe field where a hash exists, is probeFailed=true and NEVER absence - which is what preserves I4 while keeping the ref engine-validated. When observedSpecHash is null no ref name can be formed and the path fails closed to the unresolved/halt behavior. This cost (schema field, prompt change, engine comparison, its own test) is Change 1's real price and was ratified up front rather than discovered mid-edit.
