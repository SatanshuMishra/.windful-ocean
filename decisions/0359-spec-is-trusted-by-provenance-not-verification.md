---
Status: accepted
Date: 2026-08-12T01:05:24.029Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0359. The SPEC is trusted by provenance, and the codebase is not queried before the implementer phase

## Context

Section 11 of the re-architecture page, written this session, designed a SPEC trust gate whose first criterion required every claim naming a path or symbol to resolve against the graph and working tree. The user identified that as the root cause of mitosis being critically slow: mitosis treats an incoming SPEC as unverified and untrustworthy, so every phase re-audits the codebase to re-establish what the SPEC already states. The census found four symptoms of the same disease, all codebase queries performed before the implementer: planGroundTruthSeed telling Plan to re-confirm the decomposition against the tree (mitosis.js:1206), a downstream MSP receiving only bare dependency ids so it must rediscover what its dependency did (:4695, :4829-4831), Plan-review framed as fresh-no-prior-context and told to redo the D1 sweep (:3525, :3529), and Decompose told to run the full D1 stack including Serena and Read/Grep (:4175). A deferred goal is to integrate brainstorming and SPEC generation into mitosis itself; until then the SPEC's currency against the codebase is enforced manually.

## Options

- Trust the SPEC by provenance and forbid codebase queries before the implementer phase - chosen
- Keep verification-based trust: mitosis re-grounds every SPEC claim against the tree before acting
- Verify once at admission, then forbid re-verification in later phases

## Outcome

Trust is established upstream by provenance, never re-established downstream by verification. The SPEC is assumed correct because it was authored against the current codebase state — enforced manually today, and structurally once brainstorming and SPEC generation are integrated into mitosis. The binding rule: the codebase is NOT queried before the implementer phase. Decompose, cluster formation and planning all run from the SPEC alone. The single exception is graphify, which reads a pre-built map rather than the code. Section 11 as written is wrong on this axis and must be rewritten rather than amended, keeping only the checks that need no codebase access — internal consistency, testability, scope boundedness. mitosis.js:1206 and the Serena/Read/Grep components of :4175 are deleted, not optimized. One nuance must survive the change: the deliberate adversarial independence at :1344 and :3525 still holds for REVIEW of produced work, because a reviewer must not be fed the author's reasoning. Reviewing an artifact independently is kept; re-deriving facts a prior phase already established is deleted. The governing principle the user stated, adopted as a design rule: if the work of a previous state cannot be trusted, the fix belongs in the previous state, never in a consuming phase that re-derives it.
