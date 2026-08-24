---
Status: accepted
Date: 2026-08-24T05:39:53.287Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0705. The import base must be proven green before the tree is copied

## Context

The first unit archives the host repository's default branch at one commit, and that tree becomes the new repository's only root commit because history is squashed. The eight existing pre-flight rows verify the tooling that performs the copy - versions, tokens, scopes, the target name being free, the runner's language version - and none of them verifies the health of the thing being copied. At plan authoring the recorded base commit had already failed both its test and its security workflow, and nothing in the plan would have surfaced that before work started.

## Options

- Add a pre-flight gate row asserting the exact commit being archived has a complete set of passing workflow runs
- Rely on the first unit's declared unproven field, which already states the suite does not pass
- Check the branch's latest run rather than the specific commit being archived

## Outcome

Added as pre-flight row P9, a hard gate before the first unit starts. The assertion is a closed census over the exact commit: every expected workflow must have run and concluded successfully, and a workflow that did not run counts as absent rather than as a pass. The whole engine tree is scanned for secrets separately, because the repository's security workflow is scoped to the push range and reports nothing about the tree - an empty range yields zero commits scanned and a green that examined nothing. Checking the branch's latest run was rejected because that run may belong to a different commit. Relying on the unproven field was rejected because a squashed root commit has no earlier commit to bisect against, and a defect imported there becomes the baseline the vacuity guard is later measured against, which makes its criterion unfalsifiable.
