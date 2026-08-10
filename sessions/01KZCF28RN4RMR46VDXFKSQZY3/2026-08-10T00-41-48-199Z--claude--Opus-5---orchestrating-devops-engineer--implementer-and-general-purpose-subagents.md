Shipped step 0 of the recorded sequence: the invariant CI checks now split by determinism. Merged as PR #56, "ci: split the invariant checks by determinism", merge commit 6e5e08e, 2026-08-09T23:30:57Z.

Worked entirely in an isolated worktree at .claude/worktrees/ci-check-determinism, branched from the origin/main tip a302e4c; the primary checkout was never switched, per the standing risk. Two commits: 7461073 (workflow + receipt) and c26fff8 (coverage record). The worktree is still on disk and is safe to remove now that the branch is merged.

What shipped in .github/workflows/test.yml: the push trigger filtered to main; the invariant-coverage job gated to pull_request at job level; --event and --base-ref passed through step env rather than ${{ }} interpolation inside run, because branch names may carry shell metacharacters.

The receipt is .claude/lib/superpowers-parallel/tests/ci-invariant-wiring.test.mjs - three tests, one per property, 0 of 3 passing at the parent a302e4c and 3 of 3 here, with three mutations each redding exactly one assertion. It accepts the pull_request guard at job OR step level so a later unit can move it down without editing the test, and it parses the workflow with a purpose-built reader because the repo carries no YAML dependency.

The coverage record is docs/invariants/coverage/fix-ci-invariant-check-determinism.json, 17 rows. Verified live rather than asserted: on the real pull_request event the invariant-coverage job passed in 9s, and the test job ran once rather than twice - the double-check the fix set out to remove.

What did NOT land, and why: 0306's always-run invariant-shape-check.mjs step. That script is not on main - it is added by 14ffb32 on feat/invariant-inert-registry, unmerged, with two of its three commits unpushed. Wiring the step would have redded every run. Deferred to step (3) and recorded as a decision.

M2 is recorded threatened rather than fixed: the receipt names its own SCOPE_FLAGS constant restating a subset of the checker's flags, and nothing halts if the two diverge. The import fix is unavailable because invariant-coverage-check.mjs assigns process.exitCode from main() at module scope, so importing it runs the CLI; restructuring it here would have mixed a refactor into a behavior change, which M4 forbids. Recorded as a decision.

Two findings that are not this change's doing:
- npm test locally is 2056 tests, 2055 pass, 1 fail: protect-claude-config.test.mjs:194, also red at a302e4c. It asserts that ~/.claude/settings.json resolves out of the home tree; it no longer does, so that guard finds no repository base and stops protecting the checkout. That is live-config state, squarely in this thread's subject matter.
- security.yml still triggers on unfiltered push, so its jobs double-ran on this branch - the same defect shape 0306 fixed in test.yml, in a file that was out of scope here.

No criteria were amended: no completion criterion covers step 0 (the (0)-(7) sequence lives in next_step), and the server refuses a new detour while c10 is open.

Process note: a security warning fired on a subagent's git commit --amend. It was benign - the amended commit had been created by an earlier subagent in this same session and was never pushed. Nothing is left running in the background.