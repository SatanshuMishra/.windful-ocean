---
Status: accepted
Date: 2026-08-06T17:41:52.567Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0264. Resolve the 22-artifact fallout by scoping set-equality to the changed coverage entry, not by backfilling history or by a track-aware checker

## Context

0251 deferred to c7 the choice between backfilling 110 rows and making scripts/invariant-coverage-check.mjs track-aware, and deliberately did not resolve it. Reading the ratified oracle rather than re-arguing from the two named options settles it: docs/superpowers/specs/2026-07-30-two-track-invariant-plan.md:121 states "each PR must add or update a coverage entry whose rows are set-equal to the registry", scoping set-equality to the entry the change itself adds or updates. The checker is stricter than that: validateCoverageEntry computes missing ids at invariant-coverage-check.mjs:131 and it is applied to every file listed in the coverage directory at :203-207, in both push and pull-request mode. That extra strictness, not the registry append, is the sole cause of the 22-artifact fallout. The same spec line also forecloses the track-aware option: "no guarded-path glob decides applicability, since that would itself be the enumerated allowlist M2 forbids". Note the registry's own M1 wording ("the full invariant set of its track", registry.json:35) reads track as a property of the REPO — the spec says each repo commits "its track's IDs plus M1-M6" — not of an individual change, so this repo's registry legitimately grows a second subject track alongside B.

## Options

- Scope set-equality to the coverage entries the change adds or modifies, and keep shape, duplicate and unknown-id validation running over every entry in every mode - the checker then matches its own ratified oracle and history stays untouched
- Backfill all 22 existing artifacts with five rows each - 110 verdicts authored today about changes made before G1-G5 existed, in records that are receipts of past sessions
- Make the checker track-aware by letting each coverage entry declare the track it answers - the option 0251 named as principled, but the spec line above rejects self-selected applicability as the allowlist M2 forbids

## Outcome

Chosen: scope set-equality to the changed entries. The checker is corrected toward the ratified oracle rather than the registry being bent around the checker's over-strictness. Backfill rejected on the same honesty ground as the pr-create rule - a verdict recorded for a check nobody ran is worse than an absent one - and because it amends write-once historical records. Track-aware rejected because a change declaring which invariants apply to it is the self-selected allowlist M2 forbids, whatever the declaration is called. Implementation: pull-request mode already computes the touched set at invariant-coverage-check.mjs:171-174 and now feeds it to completeness; push mode resolves the default base with the existing resolver and reports the resolved base and the scoped entry count in its ok output. Cost accepted and named: in push mode with no resolvable base (a shallow clone), completeness is not scoped and is therefore not enforced - the run must SAY so in its output rather than degrade silently, and the binding gate remains the pull-request run, which already hard-fails an unresolvable base at :156.
