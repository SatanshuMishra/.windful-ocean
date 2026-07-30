Session goal was the explicit user directive carried in from the prior hand-off: implement the step-6 rebuild spec, settling two blockers first, then MSP-0 and MSP-1 in that order. Both blockers are now CLOSED. MSP-0 was NOT implemented — the session stopped at 81% context before starting an implementation that needs per-write human approval. MSP-1 was found unexecutable and was not substituted for.

SHIPPED

Blocker (a), branch. Fetched origin; origin/main had advanced to 6d19499 (PR #14 landed). Cut docs/mitosis-core-rebuild-spec off origin/main, committed the spec verbatim at d444797 as docs(mitosis), pushed. The spec no longer sits untracked on feat/centralized-pr-creation. Placement rationale recorded as 0129.

Blocker (b), preconditions. Audited all five section-2 hard preconditions BY EXECUTION, never by file presence, per 0117 and the 0103/0107 lineage. Verdicts and proofs in 0126: step 0 NOT-LANDED (worktree-reap returns "unknown verb"; no SessionStart hook line), step 1 NOT-LANDED (frontier-train-e2e.test.mjs:24-26 still rebuilds the engine with new AsyncFunction under real Node; no restricted-surface harness exists anywhere), step 1.5 PARTIAL (runScheduleStreaming built and tested but STREAMING_DISPATCH_ENABLED = false at mitosis.js:2204 and the sole production call site at :4888-4897 passes no flag), step 2 NOT-LANDED (mirror-guard.test.mjs enforces 21 modules plus the models-knob region byte-identical to inline copies, 22/22 passing), step 3 NOT-LANDED (verbs still exactly pr-create/pr-close/compare; .mitosis/run.json carries no timestamp, dispatch count, wall-clock or phase-entry field).

MSP-0's falsifier, run before elaboration per governing law 5. Survives, but conditionally — 0127. `phase:` occurs 47 times in mitosis.js, not the 45 the spec's census reports. mitosis.js:3321 is a destructuring rename in a parameter list, a regex false positive. mitosis.js:3345 is a genuine opts.phase carrying a forwarded value; all ten makeRemediation call sites were traced and every one passes a string literal, so it resolves by one hop of same-file dataflow. Finding 1 stays a rule and is NOT reopened. Two extractor rules are now binding on MSP-0.

Citation baseline corrected — 0128. The spec's section 15 provenance claim was measured against feat/centralized-pr-creation's DIRTY tree at 4,851 lines; origin/main is 4,925. Nearly every anchor moved in four bands (+59/+73/+74/+78). Four need more than a line bump, most sharply the ship read-back, which is no longer contiguous: definition at :4692-4712, its merged=true gate 35 lines later at :4747-4757. The three census numbers survive unchanged (13 declarations, 13 phase() call sites, 45 literal phase: over 13 titles), so MSP-0's numeric basis holds.

WHAT FAILED, AND WHY

MSP-1 is unexecutable on this base and was not started. Its own falsifier names the exact observed condition: the durable record has no per-dispatch boundary at all, so there is nothing to fold into dispatch counts. The missing capability is not the verb name, it is the underlying data, and it cannot be supplied from inside step 6 — step 3 owns it. Consequence carried forward: the three performance claims in spec section 14 stay labelled UNMEASURED and 0115's three falsifiers stay unpayable.

The spec's landing order stops after MSP-0. With four preconditions absent and one unflipped, every collapse MSP (2, 3, 4, 5, 8, 11) rests on capability that does not exist. This is a real defect in the plan as carried, not in the architecture.

The spec text was NOT amended. Its section 15 provenance claim is now known false for anyone branching off main; the correction lives only in 0128. Amending an approved spec is a decision, deliberately left to the user.

OPERATIONAL RESIDUE, needs action

stash@{0} holds uncommitted work belonging to feat/centralized-pr-creation (.drift-state.json, no-self-merge-consent.test.mjs, mitosis.js — 78 insertions), stashed to free the tree for the branch switch. It is labelled with its owning branch and MUST be restored there. Not mine to commit; not reviewed.

docs/superpowers/specs/2026-07-29-install-pin-safeguards.md was moved to the session scratchpad because it blocked the checkout. Verified byte-identical to origin/main's committed copy first, so nothing is lost and the checkout restored it.

docs/mitosis-core-rebuild-spec is pushed with NO pull request. It must be opened through the centralized pr-create tool.

12 leaked worktrees / 78 MB remain live. 0126 upgrades this from "reaper may be inert" to "the reaper verb does not exist at all".

Nothing is left running: no background shells, no live subagents. Two read-only codebase-analyst agents were dispatched and both returned complete; their findings are fully absorbed into 0126, 0127 and 0128 and need no re-run.