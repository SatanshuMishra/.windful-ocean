---
Status: accepted
Date: 2026-08-12T01:38:57.523Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0362. Provenance trust is operationalized by a commit binding plus an admitted-SPEC artifact

## Context

0359 ratified that the SPEC is trusted by provenance and the codebase is not queried before the implementer. Two census findings show that is not yet mechanically expressible. First, the SPEC is never handed to any phase as trusted content: Decompose gets a PATH and is told to read it (mitosis.js:4173), and Plan gets the same path AGAIN via planGroundTruthSeed (mitosis.js:1206, used at :4831) plus only four scalar MSP fields, with rationale capped at 200 chars by DECOMPOSE_SCHEMA (mitosis.js:1562-1586, additionalProperties false). Two agents independently reading one document can diverge with no detector. Second, "authored against the latest codebase, manually enforced" is a human promise with no artifact behind it, so provenance trust currently rests on nothing checkable.

## Options

- Keep the section 11 five-check gate and drop only T1's working-tree half
- Trust the SPEC with no admission gate at all, since provenance is asserted upstream
- Bind provenance to a commit and emit an admitted-SPEC artifact that replaces the spec path downstream

## Outcome

Admission binds provenance and emits an artifact. The SPEC declares authored_against as a commit SHA; the engine refuses the run when that SHA is absent or is not an ancestor of base HEAD - a run-level refusal, never a per-requirement quarantine, because partial provenance is no provenance. A drift check intersects git diff --name-only between that SHA and base HEAD with the SPEC's declared surfaces, reporting staleness without reading file content and without being fatal. Graph currency is a third free check: graph.json carries built_at_commit, which must equal base HEAD or every downstream graph fact is suspect. Admission then emits the admitted-SPEC artifact carrying each requirement verbatim with its resolved graph node ids and verdicts, and every downstream phase consumes THAT rather than the path. Without the artifact, trust is established at admission and discarded immediately after.
