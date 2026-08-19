---
Status: accepted
Date: 2026-08-19T22:28:58.792Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0629. M17's pre-rename journal recovery loss is accepted as specified, not treated as a defect

## Context

M17's contraction deletes legacyProgress, which is the reader for a pre-rename journal whose per-unit state lives in the genesis line. Measured against the same fixture, main versus the branch: selectResumeUnits goes from two units to none, selectResumeBuilt from two to none, and all five units read planned. One of them carries prUrl and mergedAt - already shipped - and now reads planned, so a resumed run would treat a merged unit as never started. It fails silently: parseRunManifest validates only logicalRunId, clusters and a non-empty msps, the schemaVersion gate at recovery.mjs:288 covers only the published manifest, and no foldRefusals entry is emitted.

## Options

- Accept it as specified and file the silent-failure half
- Hold M17 until a normalizeBaseProgress refusal is added
- Add the refusal inside M17 as part of its own blast radius

## Outcome

Accepted as specified. A5 and the ratified item 1 both direct deleting legacyProgress, which IS the pre-rename reader, so the capability loss is the ruled design rather than a defect, and the lead put it in the PR's Risk field rather than hiding it. The reviewer looked for a live victim and found none: no .mitosis directory exists anywhere in the checkout, only test fixtures. The silent half - that such a journal folds to all-planned with no foldRefusals entry - is filed HIGH with a concrete fix, not folded in. Two consequences named rather than discovered later: this retires the runbook's stated M2 falsifier, which was to fold a pre-M2 journal and assert the same settled set; and it makes the live-harness journal reset mandatory rather than optional before M15, a condition already satisfied because .mitosis is gitignored there and absent from a fresh clone.
