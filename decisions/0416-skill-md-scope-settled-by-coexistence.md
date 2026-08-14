---
Status: accepted
Date: 2026-08-14T05:08:28.294Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0416. The SKILL.md scope conflict resolves by coexistence, not by a ruling

## Context

Both PR #82 and PR #81 edited .claude/skills/plan-to-task-graph/SKILL.md, which the SPEC schedules for C5. It was the only file conflicting between them, and the prior session's next step was to rule on it before merging either. The user merged both before a ruling was made. Inspection showed the two edits are orthogonal: A4 adds a required --at argument to the derive-edges command line, B2 rewrites fileScope into the {edit, read, truncated} pack semantics. They are not rival claims on the same content.

## Options

- Rule that the file belongs to C5 and revert both edits, deferring the doc to C5 - refused, both edits describe behavior that has already shipped, so the doc would be stale against the code
- Rule for one PR and defer the other - refused, the two edits are orthogonal and both are already true of the merged code
- Accept both edits as coexisting and verify by content that neither was lost - chosen
- Leave it unruled - refused, the merge silently dropped one line and that had to be caught

## Outcome

Both edits stand. The scheduling question was moot because the edits do not conflict semantically, only textually in adjacent lines. The real risk was never the scope question but the merge mechanics: the fb42453 conflict resolution silently reverted B2's edit at line 35 while keeping its siblings at 17, 31 and 42, leaving the doc self-contradictory about whether the collision fence is the whole pack or only edit. PR #97 restores it byte-identical to B2's version. Standing lesson: when two PRs touch adjacent lines of one file, verify by change-line-set equality against each PR's own diff, because a clean auto-merge and a MERGED status prove nothing. C5 may still revise this file; nothing here pre-empts that.
