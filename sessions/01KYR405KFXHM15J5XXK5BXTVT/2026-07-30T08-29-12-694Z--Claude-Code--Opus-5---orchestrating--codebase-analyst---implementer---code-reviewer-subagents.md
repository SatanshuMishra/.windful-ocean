## Shipped: MSP-0, the only cleared step-6 work

Branch feat/phase-parity-gate cut off origin/main 6d19499 (NOT off the docs branch - MSP-0 is code, the spec doc is a separate line of work with its own pending PR). Commit 3806be0. PR 15 opened through the centralized pr-create tool. NOT merged - merge is human-gated.

Four files: mitosis.js (5 lines), frontier-train-e2e.test.mjs (1 line), plus new mitosis-gate.mjs (704 lines) and mitosis-gate.test.mjs (44 tests). 1187 insertions.

## What I did before dispatching, and why it mattered

RE-DERIVED every anchor against the live tree rather than trusting the spec or 0128's arithmetic. All five of MSP-0's spec anchors had moved (+73 band): phase('Shepherd') is :2979 not :2906; the three opts.phase literals are :2960, :3067, :3106 not :2887, :2994, :3033. Only the :5-17 declaration block was unchanged. 0127's anchors (:3321 destructuring, :3345 forwarded, and all ten makeRemediation call sites) were already correct against main and verified byte-exact.

FOUND A REQUIRED EDIT THE SPEC OMITS. frontier-train-e2e.test.mjs:489 asserted `phaseLines.includes('Shepherd')`, and phaseLines collects phase() arguments (collector at :44/:51). Renaming the phase would have left the branch RED, breaking the green-branch invariant. Caught by a repo-wide grep for the renamed string before dispatch, not by the spec. Generalize: grep for tests pinning any renamed string BEFORE dispatching a rename MSP.

Dispatched codebase-analyst for wiring facts first. It settled the twinning question decisively: mirror-guard.test.mjs:19's array is a hardcoded 21-module list covering only modules INLINED verbatim inside mitosis.js, and the three standalone CLI siblings (mitosis-git, merge-boundary-preflight, ledger-lint) are correctly absent. So mitosis-gate.mjs needs no dual edit. It also confirmed acceptance criterion 4 is satisfied for free: package.json:7's glob sweeps any new tests/*.test.mjs, test.yml:20 runs npm test, and .githooks/pre-commit:7 runs npm test. No workflow, package.json, or hook edit was needed, and receipts.yml was correctly left alone (it deploys into TARGET repos; this gate checks this engine's own source).

## The review is the story of this session

The implementer's first draft satisfied every acceptance criterion in the spec and npm test was fully green at 1598/0. code-reviewer then reproduced THREE false-clean paths with probe fixtures - in the gate's own core purpose. The scanner survived attack (nested templates, interpolated object literals, regex-vs-division, escapes all traced and unbroken); every weakness was one layer up in the regex layer consuming the masked text. See 0130 for the full findings. Highlights: a dead `const NEVER_USED = { phase: 'Final review' }` returned CLEAN on the very defect the gate exists to catch; the declared set came from the first `phases: [` in the file, unanchored to meta; and `ctx.phase('X')` was invisible - live-plausible, not hypothetical, since phase is destructured out of ctx at :1030 and handed back at :4632. A tautological assertion (`literal + destructuring + forwarded === total`, identically true on every ok path) sat exactly where a reviewer would look for the guarantee, claiming it while being blind to the miss class.

Sent all seven fixes back to the same implementer via SendMessage (cheaper than a fresh agent - full context retained). I OVERRODE the reviewer on the fix shape: it proposed allowlisting the 2 bare phase tokens by count; I required a closed token census instead - every \bphase\b token classifies into key, call or bare-identifier, and an unclassifiable token halts - because a pinned count of 2 is precisely the change-detector testing.md forbids and would break on a legitimate 14th phase.

The fix pass's own new tests then caught two bugs in the fixes, including a spread-reference miss (`...base` skipped by a `(?<![\w$.])` lookbehind) that would have produced FALSE VIOLATIONS. Live mitosis.js:1131 escaped it only by coincidence.

## Verified by me, not taken on the agents' word

npm test 1612 pass / 0 fail / 3 suites (baseline 1568 before, 1598 mid-way). Gate exit 0 on post-change mitosis.js with 13 titles agreeing across all three surfaces. Gate exit 41 on pre-change source from `git show HEAD:` naming BOTH directions (Final review unused, Shepherd undeclared). Duplicate --target exit 40. Zero comments in both new files (grep, not eye). Post-edit census 62 tokens = 47 keys + 13 calls + 2 bare; 45 literal + 1 destructuring + 1 forwarded. Three tripwire patterns confirmed zero occurrences.

## A finding I got wrong, then corrected

Early in the session I measured core.hooksPath pointing at a session-continuity plugin shim whose chain-guard resolved continuity.priorHooksPath to its OWN directory, hit the self-reference check, exited 0, and never reached .githooks/pre-commit. I reported the repo's pre-commit test gate as DEAD and spawned task_70509bf0 to fix it. By commit time the state had self-healed WITHOUT intervention: hooksPath had moved to a new worktree-suffixed key and priorHooksPath read `.githooks`. npm test was then observed running to completion during the commit, so the commit WAS gated. The measurement was accurate when taken but transient. The real defect is the capture race - the plugin can record its own managed dir as the prior path - so I spawned task_21df6527 with that framing and tried to withdraw the first chip. WITHDRAWAL FAILED: the user had already started task_70509bf0 in a separate session, so it is running independently against a premise that no longer holds. It should be closed rather than acted on. Its useful residue is the fail-loud question: silently skipping the entire test gate is the worst available outcome, and 6d19499 set the fail-loud precedent in this repo.

## Out-of-scope finding, deliberately not fixed

parallel-plan-execution.js:8 declares `{ title: 'Final review' }` and nothing in the tree uses it - the IDENTICAL defect class MSP-0 just removed from mitosis.js. Confirmed by hand: run-engine.mjs calls only phase('Waves') :472, phase('Integrate') :482, phase('Boundary') :557. The gate HALTS fail-closed there (exit 42, "no phase() call sites were found in the target") rather than passing, because that file declares phases and delegates `phase` as a callback into run-engine.mjs at :32 - declaration and use in DIFFERENT FILES. A follow-up needs a cross-file gate mode, not another entry in a target set. Left untouched per the scope fence; the CLI does accept --target so the probe cost nothing.

## Judgment calls made, with reasons

Resume stays at meta.phases index 10 (the slot the dead phase vacated) rather than moving to execution order between Reconcile and Decompose. Order is display-grouping only, MSP-13 owns Resume and will place it with full context, and moving it now is diff noise. The reviewer fairly noted a set-based parity gate structurally cannot catch ordering, so nothing else will flag it - which is why this is recorded as a decision rather than left as an artifact.

The CLI having no in-repo caller is accepted as designed. Enforcement comes from the test file under npm test, which is exactly what acceptance criterion 4 asked for. The CLI is an operator tool.

mitosis-gate.mjs grew 542 to 704 lines through the fix pass - under the 800 ceiling, above the 200-400 band. The scanner-extraction split is a stronger follow-up candidate than it was; not done, because the scope fence named one file.

## Nothing left running

No subagents or background shells of mine are live. task_70509bf0 runs in a separate user-started session and will notify here. The working tree carries only the five pre-existing untracked items (two .bak files, the context7-mcp skill dir, two untracked spec docs) - none of them mine, none staged.

## Not done, and why

PR 15 is NOT merged (human-gated). The docs/mitosis-core-rebuild-spec branch is still pushed with no PR. stash@{0} is still parked and still belongs to feat/centralized-pr-creation. 12 leaked worktrees / 78 MB still live. No collapse MSP was started - 0126 blocks MSP-1 and every collapse MSP, and the thread's own directive was to stop and re-plan after MSP-0.