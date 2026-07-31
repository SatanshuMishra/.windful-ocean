---
Status: accepted
Date: 2026-07-31T07:05:05.656Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0148. Commit the engine specs verbatim; their anchors are accurate at 450804e and stale against main

## Context

Both approved engine specs were untracked and one session from loss. Before committing, their path:line anchors were checked. Against current main (95ef8e1) 22 of 23 named anchors appeared drifted, which looked like the 0137/0144/0145 hand-enumeration failure mode repeating. It is not. Section 8 of the quiescent-advance spec declares its derivation baseline as commit 450804e, and re-derivation by execution against git show 450804e:.claude/workflows/mitosis.js confirms all 23 named anchors resolve there - 19 to the symbol definition line and 4 to the cited usage site (isBuildable :1909, WINDOW_FLOOR :1963, planTick :1966-1981, PR_NOT_VERIFIED_OPEN_CI :4655). The run-readiness-repair spec carries no path:line anchor at all.

## Options

- Commit the specs verbatim and record the baseline gap in the coverage row and PR risk field
- Rewrite all 78 anchors to current main before committing
- Leave the specs untracked until an MSP consumes them

## Outcome

Committed verbatim, with the baseline gap recorded rather than silently repaired. The specs are honest documents that declare their own baseline; rewriting 78 anchors by hand would reintroduce precisely the hand-enumeration failure mode 0137, 0144 and 0145 record. The operative hazard for any implementer: 450804e is an unmerged branch head (feat/centralized-pr-creation, behind 4) while main has moved to 11421ef and mitosis.js has grown 4847 to 4926 lines, so anchors are off by +36 to +78 varying BY REGION - no single offset repairs them. Re-baseline by execution before trusting any line number in either spec. Landed as PR #20, merged 11421ef.
