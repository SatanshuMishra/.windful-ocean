MATERIAL FOR THE NEXT SESSION'S MANDATORY FIRST ACTION — the plain-language briefing the user asked for. Docket is now 375 lines (the earlier entry said 283) and carries the full version.

PR #70 CONFIRMED. gh pr view post-creation: OPEN, MERGEABLE, head 9cb7469 matches local, base main, not merged. Title: fix(mitosis): refuse a non-array or non-string fileScope. Verified green, all re-run and read by the orchestrator: full suite 2220 = 2218 pass / 0 fail / 2 todo exit 0; mitosis-gate phase-parity ok:true exit 0; per-file wave-planner 27 pass + 2 todo, derive-edges 19, mirror-guard 46, dead-export-lint 3, leases 28, derive-clusters 14, generate-run-script 17, mitosis-scheduler 192. One --not-verified on the PR: no live engine end-to-end run.

ITEM 3 — WHAT THE FAIL-OPEN ACTUALLY IS. globPrefix is not a glob engine, it is a truncation: it returns everything before the first * or ?. For '*.js' and '**/*.js' that is the EMPTY STRING, and the match test then asks whether the other path equals '' or startsWith('/') — both false for any relative path. So the BROADEST POSSIBLE SCOPE MATCHES NOTHING. Separately, the forced '/' separator means a mid-segment prefix ('src/a*.js' truncates to 'src/a') can only match at a directory boundary, so it never matches 'src/abc.js'.

Boundary-aligned globs work ('src/*.js', 'src/auth/**'). Root-level globs, mid-segment stars and brace sets fail open, as do 'src/./x', 'src/../src/x', 'src//x' and trailing whitespace, because normalize strips only one leading './' and trailing slashes. Proven end-to-end: '**/*.js' and 'src/shared.js' return [["a","b"]] — one wave, concurrent writes to the same file.

Blast radius is all four layers at once, by design: the 2026-06-29 plan deliberately made scopesOverlap the single shared overlap oracle ("do not re-implement path overlap"). The mitigation was CHECKED, not assumed: lintCoarseScope exists but only FLAGS for reviewer attention, and it misses precisely the two failing shapes.

NOT AN EMERGENCY, BUT DO NOT DEFER INDEFINITELY. Both committed graph files use literal paths — all 15 entries verified. But the engine's own prompt invites directory globs, and 'src/auth/**' happens to work while '**/*.js' does not, so correctness turns on an undocumented positional accident. SPEC D2 deleting mitosis.js halves the fix cost later by removing the mirror obligation.

ITEM 4 — WHY PREFIX MATCHING AT ALL. IT WAS NEVER CHOSEN; IT WAS INHERITED. git log --all -S globPrefix returns three commits: the initial dotfiles import, an unrelated overhaul, and this session's. It arrived with superpowers-parallel, was explicitly ring-fenced as "untouched by design" in the 2026-06-11 parallel-two-lane plan, and was then adopted as canonical. A truncation heuristic became the parallel-safety invariant without ever being reviewed on its merits.

The design constraint behind it is real: a pure, dependency-free predicate that must work on files that do not exist yet and must be mirrored verbatim into mitosis.js. That rules out fs-touching path resolution and argues against a glob dependency.

THE DECISIVE POINT FOR WHOEVER FIXES THIS: the failure is DIRECTIONAL. The question being asked is "could these two tasks touch the same file?" Over-approximating is SAFE — it only over-serializes, costing parallelism. This implementation UNDER-approximates, which is the unsafe direction. Correcting the direction is cheap and needs no dependency: treat an empty prefix as matching everything, drop the forced separator, add a real canonicalizer. Every residual gap (no brace expansion, no distinction between * and ** depth) would then OVER-match and therefore fail safe.

Docket also carries four smaller open findings (leases element types, derive-clusters id naming, overlapHolder empty-map fail-open) that could ride along with a pathsOverlap fix.

STOPPED CLEANLY. A1 not cut. Nothing half-pushed. Both worktrees clean; stack untouched at 9d95065.