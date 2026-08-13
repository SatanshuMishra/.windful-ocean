Requirement pivot, then a full research round, then a ratified SPEC.

WHAT CHANGED. The user superseded the audit's operative goal: no longer "assess the config against Anthropic's recommendations" but "maximum agent freedom, guards ONLY on the highest and most critical elements". Success test is behavioral - start a task, go to bed, wake to ALL tasks complete, no stall waiting for permission. The user also ruled on the four standing rules: no-direct-DB-access KEEPS unchanged; centralized PR creation KEEPS unchanged; destructive-git confirmation NARROWS (worktree cleanup runs free); the --dangerously-skip-permissions prohibition is OPEN.

FIVE AGENTS DISPATCHED, all returned. (1) stall inventory of this repo, (2) autonomy config surface from official docs, (3) irreversibility frontier, (4) reversibility engineering, (5) catastrophe-gate design.

FINDINGS THAT REDIRECTED THE DESIGN.
- A PreToolUse hook returning allow does NOT bypass deny/ask rules (docs verbatim). The orchestrator had flagged the opposite as the biggest lever; corrected. permissions.deny is the binding constraint, so pruning it is a prerequisite to any gate work.
- Auto mode in a non-interactive run does not stall - it SILENTLY SKIPS the blocked action and reports a completed run. Two agents reached this independently. This defeats the stated goal worse than a visible stall does, and is why bypassPermissions was chosen over the docs' own steer toward auto mode.
- The user's (c) intuition inverted: GitHub repo deletion has a 90-day self-service restore and branch deletion is reflog-recoverable, so neither is a catastrophe. The real zero-window loss is git clean -fdx / reset --hard on UNCOMMITTED and UNTRACKED work.
- The safety net assumed to exist does not: sandbox off, Time Machine unconfigured, zero APFS snapshots ever taken, Docker daemon down.
- protect-claude-config.sh asks on edits under .claude/{hooks,rules,lib,workflows} - the entire content of this repo and the entire surface of the implementation. The redesign stalls on itself unless narrowed first. Made step 0 of the change set.
- Logbook plugin guard FAILS CLOSED on any internal exception, denying the whole Bash/Write/Edit/MultiEdit/NotebookEdit surface with no circuit breaker. Worst overnight-freeze risk found; it lives in a plugin, not in this config.

ORCHESTRATOR-VERIFIED (not taken on agent word). ~/.claude/hooks resolves to releases/<sha>/hooks, a COPY not a working-tree link (inodes 146185942 repo vs 147457416 live). converge.mjs is registered on SessionStart and Stop and auto-promotes on drift, but validate.mjs can reject a candidate and silently leave live pinned - so the risk is a silent no-op, not a missing manual step. settings.local.json holds 202 allow rules, 0 deny, 0 ask, and grew 199 -> 202 DURING this session.

SHIPPED. docs/superpowers/specs/2026-08-13-maximum-autonomy-permission-architecture-SPEC.md on branch docs/max-autonomy-permission-spec, three commits (375ee56 spec, c1a1f70 pressure test, 31bdd62 ratification + amendments). Ratified R1-R6.

PRESSURE TEST OUTCOME. Attacked each guard from the maximum-autonomy position. Guard SET sound - none unnecessary, none missing. But three needed amendment and one mechanism was rejected: D1 gated authorship when its rationale is disclosure; D2 had no maintenance path so the recovery layer grows unbounded; D4 over-matched routine PR/issue comments; D6's git stash create cannot capture untracked files, which is exactly the class it exists to protect. All four applied. The 19ms checkpoint budget belongs to the rejected mechanism and does NOT carry over.

NOT DONE, DELIBERATELY. Nothing implemented. No config file touched. The seven U1-U7 experiments are unrun and the SPEC forbids implementing any dependent step before they are. No PR opened.