---
Status: accepted
Date: 2026-08-11T19:50:43.471Z
Thread-Id: 01KZS3HZHY8T9JTPQS3CGH29T9
---

# 0345. Merging the rename and running the cutover are one operation, not two

## Context

~/.claude/lib resolves through current/ into release b49de71, which still contains superpowers-parallel. The drift-check hook is registered at SessionStart with an EMPTY matcher and hard-fails exit 1 when its resolver is missing. So in the window between merging PR #64 and running the cutover, every new session errors on start. mitosis.js's absolute ~/.claude/... literals carry the same exposure. Nothing catches this: the test suite resolves relative to the worktree, so it stays green across the entire window - the 2188/2188 pass says nothing about the promoted release. This is a deploy-ordering hazard created by the rename, not a defect in it.

## Options

- Merge and cutover executed as one operation - chosen
- Merge now and cutover whenever convenient
- Hold the PR until the release machinery tolerates a missing resolver
- Make the drift-check hook fail soft so the gap is survivable

## Outcome

PR #64 is merged and the cutover run as a single operation, with no session started in between. The hook is NOT softened to paper over the window: it hard-fails precisely because a missing resolver means the config is inconsistent, and trading that signal away to make a deploy sequence convenient would remove the detector rather than the fault. Holding the PR was rejected because the exposure is inherent to renaming anything the release promotes, so it recurs on every future rename and is better handled as an operating rule than as a reason not to rename. This is the one finding from the run that bites if ignored, and it is recorded on the PR as a risk rather than left in a session transcript.
