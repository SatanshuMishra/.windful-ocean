---
Status: accepted
Date: 2026-08-09T20:48:17.318Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0307. The two production guard sets stay separate and the test-local hand-list derives from them; GUARDED_CONFIG_ENTRIES is not implemented

## Context

artifacts/2026-08-10-open-questions-for-round-6.md Q5(a) states that three overlapping constant names were collapsed into one, GUARDED_CONFIG_ENTRIES, homed in scripts/config/paths.mjs, and that the file exists only on the cutover branch. Verification found neither claim holds. No symbol of that name exists in the primary checkout or the cutover worktree, including uncommitted edits, and scripts/config/paths.mjs is present on main and byte-identical to feat/config-entry-link-cutover. The collapse was described but never landed.

Three lists do exist, and they are materially different rather than three names for one thing. PROMOTED_ENTRIES at scripts/config/paths.mjs:18 holds the 10 entries a release snapshots, with CUTOVER_ENTRIES at :33 adding notes. GUARDED_FILENAMES at scripts/config/capture.mjs:141 and GUARDED_PREFIXES at :148 hold what a hook must refuse to overwrite, are a strict subset, and are split by filename versus directory prefix because they answer a different question. The third is a hand-typed 7-entry GUARDED list at .claude/hooks/tests/protect-claude-config.test.mjs:97, which restates those constants as fixture paths and imports nothing from capture.mjs.

## Options

- Keep the two production sets separate and have the test derive its cases from GUARDED_PREFIXES and GUARDED_FILENAMES - ADOPTED
- Merge all three into one constant as the artifact describes - rejected, the mirror image of the hand-list bug: a set too wide for two of its three consumers, silently broadening what a hook refuses
- Implement GUARDED_CONFIG_ENTRIES as specified - rejected, the premise is false and the constant was never created
- Leave the test-local hand-list alone as merely untidy - rejected, it is a hand-list guarding the guard, which is the exact disease 0301 names

## Outcome

The phantom merge is not implemented, and the artifact's Q5(a) claim is superseded by this record.

The two production sets stay separate on the ground that they answer different questions: what a release snapshots is not what a hook must refuse to overwrite. Merging them would widen the guarded set for two of its three consumers, which is a silent behaviour change in the more dangerous direction.

The real defect is the third list. The test derives its cases from GUARDED_PREFIXES and GUARDED_FILENAMES instead of retyping them, which collapses three lists to two, kills the hand-list without merging anything, and makes the test grow automatically when a prefix is added rather than staying at seven hand-picked cases.

Expect the two already-flagged protect-claude-config tests to invert. Per the standing risk, the defect is not preserved to keep them green - those two tests encode the suppression the planted-receipt finding exploits.
