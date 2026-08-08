Reconnaissance session. No code shipped, nothing written to ~/.claude, no branch switched in the primary checkout.

Located SPEC A: docs/superpowers/specs/2026-08-06-config-staging-live-promotion-SPEC.md on origin/main, standalone rather than a section of the mitosis re-spec.

MEASURED THE SWAP INVENTORY that 0286 recorded as unimplemented. Live ~/.claude holds 9 depth-1 symlinks into the checkout (CLAUDE.md, agents, docs, keybindings.json, lib, notes, skills, sounds, workflows) plus hooks/ and rules/ as REAL directories holding 26 and 2 inner symlinks respectively. Eight of the depth-1 links plus hooks and rules make TEN promoted entry links, matching PROMOTED_ENTRIES at scripts/config/paths.mjs:14 exactly; the SPEC's "eleven entry links" is stale against 0276, as 0276 itself states. ~/.claude/releases/, ~/.claude/current and ~/.claude/LIVE are all absent. ~/.claude/local/ holds the 6-module bootstrap installed 2026-08-07 and is inert. Live settings.json carries NO converge.mjs registration while repo settings.json registers it at :110 and :174, so c3 is repo-side only.

THREE FINDINGS THAT ENLARGE THE UNIT.

1. Preconditions 3 and 4 are closed in the REPO but the LIVE tree still carries pre-fix artifacts, a distinction c1 does not capture. The graphify relocation landed: .claude/hooks/graphify-common.sh:45 routes any config-root path to $config/graphify-out, and .claude/hooks/tests/graphify-out-path.test.mjs:59-62 asserts hooks/ and rules/ get no local output. Yet ~/.claude/hooks/graphify-out (Jun 30) and ~/.claude/rules/graphify-out (Jun 28) both predate that fix and are still on disk, as is ~/.claude/rules/context7.md (Jul 21). Those three real entries are exactly what blocks hooks/ and rules/ from collapsing into single symlinks. The cutover verb must dispose of them; nothing else will.

2. context7.md IS tracked at .claude/rules/context7.md on main, so the release carries it and the live copy is a redundant, safe removal. Precondition 4 genuinely closed.

3. notes/ has no disposition in tooling. 0276 reclassified it live-only under local/, but live ~/.claude/notes is still a symlink into the checkout and its five real files sit in the checkout's untracked .claude/notes/ - two of them the foreign-project cryptography material 0276 refused to publish. Repointing the link strands them; removing it destroys them. The move into local/ is unbuilt.

THE ln -sfn GAP IS WORSE THAN 0286 STATED. manifest.mjs:28 UNIONED_SECTIONS = ['allow'] means promotion UNIONS permissions.allow, so the stale live grant survives every future promotion, not merely the first. NOT_ADOPTED_GRANTS at manifest.mjs:30 guards only the capture direction via capture.mjs:65,71-77. Refusing to capture a grant is not the same as removing it; no withdrawal mechanism exists on the promote direction.

0286's explicitly-unsettled question is now closed: settings.json stays a REAL live file and the guard's PROBE_FILES test is what changes. Recorded as a decision.

A dispatched subagent recommended adding notes back to PROMOTED_ENTRIES to "close a SPEC gap". Rejected and not acted on: it would reinstate the defect PR #54 fixed and publish confidential material to a public repo. Flagged here because the same wrong inference is easy to re-derive from the SPEC text alone, which is stale on this point.

CARRIED AS UNRULED: collapsing rules/ into a release symlink removes ~/.claude/rules/graphify-out/GRAPH_REPORT.md from every session's loaded global instructions. Surfaced to the user; no ruling given. Recorded as an open risk, not a decision.

The user then directed that the fresh session both BUILD the cutover unit and RUN the live cutover. Recorded as a decision, including the tension it creates with the SPEC's "session doing nothing else" rule and the ordering that resolves it.