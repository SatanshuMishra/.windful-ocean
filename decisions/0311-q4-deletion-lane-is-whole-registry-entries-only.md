---
Status: accepted
Date: 2026-08-10T00:56:32.325Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0311. The Q4 deletion lane removes whole registry entries only, and writes the live tree directly under a single serialized writer

## Context

Step (1) of the round-6 order is the Q4 deletions: registry entries that are rules or procedures with no nameable set to quantify over, so no witness can ever exist for them. The 2026-08-09 system regrade grades DELETE at three different levels and the open-questions note does not distinguish them, so the lane's boundary was undefined. Level one is three whole registry entries: M2 (any classifying gate is a closed census), M3 (every fix ships a red-before-green receipt plus an inertness mutation) and M4 (a refactor and a behavior change are separated). Level two is DELETE halves living inside entries the same regrade grades SPLIT: M1b (recorded in the repo, never in the PR body) and B6b (compileWorkflow specifically has a caller, which survives as a row inside B6a). Level three is non-registry prose that calls itself an invariant: DoD1 and DoD4 in the bash-gate threat model, the green-branch invariant wording in pull-requests.md, the Global invariants heading in .claude/CLAUDE.md, and the orphaned A1-A6 in the two-track spec. Separately, every destination rule file is symlinked into live global config, so a write reaches every running session the instant it lands - the standing risk that the cutover thread has carried since 0275.

## Options

- Level one only - delete M2, M3 and M4 from the registry, relocate each sentence to the rule file that already owns it, and clear the id out of UNWITNESSED_IDS, INERT_BARRED_IDS and any coverage fallout - ADOPTED
- Level one plus the sub-property deletions M1b and B6b - rejected, both require partially rewriting entries the later rewrite/witness step will reopen, so the lane would touch registry.json twice from two lanes, which is the exact collision that blocked Q4 from being dispatched in the first place
- Everything graded DELETE, including the threat model's DoD1 and DoD4, the green-branch wording, the CLAUDE.md heading and the orphaned A1-A6 - rejected for this lane, it edits a ratified threat model and the user's global CLAUDE.md, which is a different review surface from the registry
- Stage the edits in a worktree and land them through a PR so the live tree changes only at merge - rejected, the primary checkout serves live config either way, so the merge is the same hot-swap moment and the worktree only adds a step

## Outcome

Adopted level one. The lane deletes exactly three whole registry entries - M2, M3, M4 - and relocates each sentence into the rule file that already owns it. Every entry the regrade grades SPLIT or REWRITE is out of scope and its registry text is not touched, so this lane and the later rewrite step never hold registry.json open at the same time.

The writes go directly into the live-linked tree, with one subagent as the sole writer under .claude/rules/ for the whole lane, writing one file at a time so no half-saved file is ever visible to a running session. A worktree was considered and rejected: the primary checkout is what serves live config, so isolating the edit does not isolate the hot-swap, it only moves it to the merge.

The scope choice is deliberately conservative in the direction that keeps the registry single-writer. Nothing about it says the level-two and level-three deletions are wrong - they are correctly graded and remain filed; they are simply not this lane's business, and pulling them in now is the scope creep that produced round six.
