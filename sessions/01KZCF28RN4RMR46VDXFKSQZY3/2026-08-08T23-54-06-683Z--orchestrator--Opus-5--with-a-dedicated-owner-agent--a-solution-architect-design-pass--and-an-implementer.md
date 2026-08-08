Objective this session: complete c3 and c10 via a dedicated subagent. c10 did not close and c3 advanced to its pre-swap boundary. Nothing was committed, pushed, PR'd, or written live.

WHAT SHIPPED

c3 Stop-path fix, in the branch. The defect was real and verified before fixing: converge.mjs registered as a Stop hook wrote a SUCCESSFUL live-config promotion to stderr with exit 0, and the shipped Claude Code 2.1.224 hook schema discards BOTH streams at Stop/exit-0. A real mutation of global config was reported to nobody. Both premises were checked against the binary rather than taken on trust. A refinement the implementer found and I had missed: the FAILURE path was never silent, because exitCodeFor returns exit 1 for a refused or rejected Stop and exit 1 shows stderr to the user. So the fix routes by EXIT CODE, not by event; routing by event would have moved the error path into additionalContext and traded one silent path for another. exitCodeFor is unchanged, so SessionStart stays bit-identical. RED first at scripts/config/tests/converge.test.mjs:139 ("an exit-0 stop hook has its stderr discarded, so nothing may be reported there"), green after. The test that ENCODED the defect was rewritten in place rather than duplicated, and promoted to a real spawnSync process boundary. Silence is asserted as a recursive tree snapshot (path, symlink target, size, mtime) deep-equalled before and after, for both the converged and the uninitialised machine state, not merely as absent output. Counts moved 146/0 to 147/0 (config) and 2116/0 to 2117/0 (full suite); the +1 is the added silence test. Scope fence held: only converge.mjs and its test are newly modified.

c3 also PROVEN, not asserted: SessionStart emits the drift report in the documented hookSpecificOutput.additionalContext form (exit 0, stdout JSON, stderr empty), including on a rejected promotion. Repo-side registration on origin/main is correct as-is at .claude/settings.json:110 and :174; no branch change needed. The live delta is pinned as two pure appends, one element each to hooks.Stop[0].hooks and hooks.SessionStart[0].hooks, with the warning that on today's uninitialised machine the correct result is SILENCE.

WHAT FAILED, AND WHY

c10 is BLOCK. Four independent reviewers (two code-reviewer, two security-reviewer), unanimous. The round-3 numbers all reproduced under independent measurement (146/0, 2116/0, invariant gate exit 0), so the numbers were never the problem. Five blockers stand, plus a stale invariant-coverage record whose M5 row falsely self-certifies, plus eight MEDIUMs. Two blockers are probe-verified exploits: a crafted CUTOVER journal plants an arbitrary symlink at any config-root entry including ~/.claude/hooks, and a planted ~/.claude/LIVE receipt silences protect-claude-config.sh for repo-path guardrail edits. The third is a silent data-destruction path (entry.aside trusted by containment only, so rollback relocates arbitrary content and reports success). The LIVE-receipt one is a security regression THIS DIFF INTRODUCES into an existing guardrail.

The owner agent fixed nothing, deliberately, and that call was correct. Four of five blockers shared one root cause, and one reviewer's recommended fix for the top finding was itself over-strong: containment-checking entry.target before restoring a prior link would refuse every legitimate rollback.

THE SESSION'S REAL OUTPUT

A design pass then falsified BOTH the root-cause framing and the remaining proposed fix. My framing (authenticate and gate the control files) was rejected as the wrong axis: a MAC answers whether bytes were modified, when the question is whether the file has authority to name a syscall argument. And the round-4 report's cheaper F1 remedy - derive created from linkTargetFor(name) - does NOT close F1: it turns the ownership test into a predicate about current STATE, which every promoted entry satisfies by construction after a legitimate cutover, so ours is true for all eleven names for anybody and the hooks exploit survives. A fix round implementing it verbatim would have shipped a still-exploitable rollback believing F1 closed.

Three consecutive proposed remedies were wrong in this unit: round 3's correction too strong, round 4's reviewer proposal too strong, round 4's cheaper proposal too weak. That recurrence is the argument for the contract.

Adopted property: rollback must never synthesize prior state from a description of it; it relocates prior state preserved on disk. Seven invariants I1-I7 written to artifacts/2026-08-08-cutover-control-file-invariants.md, each with forbid-set, permit-set, and the realistic pre-state that falsifies it if stated too strongly, plus a 10-step implementation order and the decisive test. Decisions 0294 and 0295 recorded; 0295 supersedes 0294 on one point (the already-linked blocker is a PRECONDITION, not separate work).

PROCESS NOTE

The owner agent stalled once: it dispatched its reviewers in the background and ended its turn believing it was waiting for them. Ending a turn is finishing, not waiting. It was resumed with a corrected model and instructed to dispatch synchronously; the second run delivered. Worth knowing for any future multi-round owner dispatch.

FILED SEPARATELY

.claude/docs/superpowers/plans/2026-06-30-continuity-v2-04-hooks-and-trailer.md:37 documents the Stop hook contract as exit-2-only and is stale against the shipped binary. Any other hook written from that note may carry the same silent-output bug. Spawned as a background task, not pulled into this branch.

NOTHING RUNNING. No background agents, no shells, no pending writes.