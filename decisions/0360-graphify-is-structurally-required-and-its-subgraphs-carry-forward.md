---
Status: accepted
Date: 2026-08-12T01:05:42.397Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0360. Graphify is structurally required in Decompose and its per-cluster subgraphs are passed forward as JSON

## Context

This session's census established that graphify is not integrated into mitosis at all: grep returns zero matches across every engine .mjs and mitosis-execute.js, and all four references in the system are prose inside LLM prompts (mitosis.js:4175, :4181, :4896; plan-to-task-graph/SKILL.md:31). Neither DECOMPOSE_SCHEMA (:1562-1585) nor PARALLELIZE_SCHEMA (:1723) requires a graphify-tagged field, and the nearest shape check (:4949-4955) is satisfied by an empty discovered-edges file. Meanwhile the live parallel-safety gate is the decomposer model's own self-declared dependsOn and fileScope, compared by pure string and glob prefix match (:5469, :2451-2458, :52-67) — the model that proposes the partition is the only thing certifying it is safe. I had framed graphify as colliding with pillars.md; the user pushed back and the pushback is accepted. The framing conflated two uses: locating surfaces, related files and communities, where graphify is reliable and token-free, versus using its call edges as the sole authority that two clusters cannot collide, which is the only place the recall question ever lived. The census also found the pillars claim is unmeasured: tool-routing.md:8 calls graphify's call-graph recall too low to gate parallel-safety, originating at docs/plans/2026-06-29-mitosis-01-governance-foundation.md:145, with no numeric figure anywhere in-repo, while the live graph carries 3,040 calls edges of which 3,000 are AST-extracted rather than LLM-inferred.

## Options

- Make graphify structurally required in Decompose and carry per-cluster subgraphs forward - chosen
- Keep graphify as prompt guidance and add native LSP confirmation on cut edges only
- Leave the current self-declared dependsOn and fileScope as the parallel-safety authority

## Outcome

Graphify becomes a structural requirement, not a suggestion. In Decompose it reads the SPEC, determines which files the SPEC targets, and determines parallelizability; parallel sections split into clusters while sequential elements stay within a cluster. Decompose emits each cluster's subgraph as a JSON object and passes it forward to that cluster's subagents, so a fresh subagent never repeats the graphify work — the subgraph is the carried artifact, and it is better than prose findings because it is machine-checkable and has no summarization loss. Enforcement is schema-level: a provenance-tagged subgraph field on DECOMPOSE_SCHEMA where an absent or empty graph slice is a refusal, not a pass, because requiring a tool in prose is not requiring it. This supersedes the graphify-proposes-LSP-disposes recommendation made earlier in this session, which the user rejected. Two consequences are recorded rather than buried. First, this makes graphify a direct replacement for the self-declared parallel-safety authority rather than a check on it, which is a larger change than a verification layer would have been. Second, pillars.md cites an unverified claim as its canonical worked example; the remedy is to measure graphify call-edge recall against LSP on a sample and record the number, or to soften the example to a stated policy default — raised with the user, never edited silently, since it is a global rule.
