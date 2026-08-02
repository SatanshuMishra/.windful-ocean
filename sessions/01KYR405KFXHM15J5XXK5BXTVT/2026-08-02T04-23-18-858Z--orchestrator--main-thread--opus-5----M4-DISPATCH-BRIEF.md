M4 CONTRACT. Read 0187, 0086, 0151 and 0194 before dispatching. M5 is merged and closed; do NOT re-open it.

PRECONDITIONS to confirm before any work (all true at hand-off): origin/main is 9ea75d6, which is PR #32 squash-merged. The main worktree is still checked out on the MERGED branch feat/m5-quiescent-exit at 556706c and was deliberately not switched - CUT THE M4 BRANCH FROM origin/main AT 9ea75d6, never from feat/m5-quiescent-exit. Working tree carries ONLY the five known pre-existing dirty paths. Suite at 556706c is 1846 pass / 0 fail and both coverage-gate modes exit 0, measured LOCALLY; CI has never been read on this branch or on the merge commit.

WHAT M4 IS, per docs/superpowers/specs/2026-07-28-mitosis-quiescent-advance.md:307 - re-read section 3.3 and lines 307, 314, 320 and 356 before acting, and re-derive every anchor by grep at 9ea75d6 because all cites are stale:
1. Fix the build-ahead cap at K. 0086 already CONFIRMED K=8, so the gate the spec names at line 371 is CLOSED; do not re-litigate it.
2. DELETE AIMD, the window delta, and the review-decision read.
3. ADD the section 3.3 divergence instrumentation (per-run divergence and rebuild-unit counts).

TWO THINGS M4 INHERITS, both easy to miss:
(a) Spec line 314, re-baselined by M5: M4 had NOT landed when M5 shipped, so no M4 commit exists and AIMD is FULLY LIVE - nextWindow, clampWindow, windowDelta and persistWindowCheckpoint are all present. M5 deleted exactly ONE of AIMD's three signal sources, the poll consumer; the reconcile-path sources keep the controller alive. M5 MEASURED that all nine 'AIMD window W=' assertions in frontier-train-e2e.test.mjs still pass after the poll deletion, so M4's deletion WILL reach those assertions and must own them. The scope is therefore larger than the one-line spec row implies.
(b) 0187: the advance.toRestack log line still carries a live AIMD clause and was explicitly carried FORWARD to M4 rather than hotfixed. It is M4's to own.

STRUCTURAL GOTCHA, spec line 320: mitosis.js inlines copies of the lib modules, policed by byte-identity in .claude/lib/superpowers-parallel/tests/mirror-guard.test.mjs. EVERY deletion must land in BOTH copies in ONE commit or the guard fails, and landing stays SERIAL. 0151 established the gotcha list is incomplete, so re-derive the twin surface for each change against MIRROR_CENSUS rather than reusing a prior list. Established this session and reusable: files under tests/ are NOT census-governed, because libModuleNames() enumerates readdirSync(LIB).filter(entry.isFile()) non-recursively, so a new test file needs no twin.

INSTRUMENTATION IS NOT A TEST, spec line 340: M4 logs the counts; the test-admission gate correctly refuses a test asserting on a log string, which would be a change detector. Do not let an agent add one. Spec line 356 is the reason the instrumentation exists at all - fixed K may cost a rebuild burst on deep chains, and that cost is unmeasured.

WORKFLOW SHAPE that worked for M5 Stage 2 and is the recommended default: a SMALL serial workflow, about four agents - implement-and-commit, receipt-and-commit, adversarial verify (fenced read-only against the repo, re-running the decisive mutations itself), then ship. HARD-GATE the ship phase on the verifier's verdict in the script, so nothing is pushed if verification fails. It produced zero manufactured blockers.

ORDERING RULE FROM 0194, the single thing most easily got wrong: DO NOT instruct any agent not to commit. Every verification lens, the coverage gate especially, runs AFTER the commit that produces what it measures.

OTHER STANDING CONSTRAINTS: distinct scratch subdirectory per agent; stage explicit paths only, NEVER git add -A; never patch a committed artifact to run a mutation - mutants live in scratch copies selected through MITOSIS_PATH; the engine is .claude/workflows/mitosis.js, NOT under .claude/lib/superpowers-parallel/; PR scope is frozen at creation and merge stays human-gated; pr-create requires --provenance with --origin machine and rejects angle brackets in --what.

CHEAP FIRST MOVE, unowned by any MSP: read CI on 9ea75d6. No session has ever read CI on this work.