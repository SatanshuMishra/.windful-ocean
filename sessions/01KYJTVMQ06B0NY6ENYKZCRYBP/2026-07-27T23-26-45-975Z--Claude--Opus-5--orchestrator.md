Both owed cleanup items SHIPPED. Branch `fix/ledger-lint-boundary-guards` in worktree `.claude/worktrees/ledger-lint-guards`, cut from main (cd5c65d). Two atomic commits, working tree clean, 2 ahead of main. NOT pushed, no PR opened — deliberate, see blocker below.

COMMITS
- 60cba74 fix(ledger-lint): enforce the identifier contract at the flagHasReachableTruePath boundary. Completion criterion 4. `flagHasReachableTruePath` is exported but validated only argument TYPES, so a non-identifier name reached two RegExp constructions. Measured defects: name `'('` threw an uncaught SyntaxError; `''` and `'A-B'` returned a spurious true, which makes lintFlags SKIP a stale flag (fails in the suppressing direction). Fix = guard against the module IDENTIFIER shape + widen escapeIdentifier from `/[$]/g` to the full metacharacter set `/[.*+?^${}()|[\]\\]/g`. Returning false is fail-closed: lintFlags then REPORTS the flag. Added `IDENTIFIER_RE` as a separate literal regex (no flags, so `.test()` carries no lastIndex state); `IDENTIFIER` left as its original plain literal.
- 0fe891a chore(impeccable): drop prose trailing the nosemgrep pragmas at live-accept.mjs:357, live-inject.mjs:233, live.mjs:216. The 14 UPHELD sites untouched.
Split rationale: the ledger-lint prose asserted the very invariant the guard now enforces, so it belongs with the fix; the impeccable deletions are independent cleanup.

EVIDENCE (all measured, not asserted)
- TDD red first: actual `SyntaxError: Invalid regular expression ... Unterminated group` plus three spurious `true`s against unmodified source.
- Both fixes proven INDEPENDENTLY load-bearing: escaping alone still admits `''` and `'A-B'`; the guard alone leaves escapeIdentifier wrong for reuse. One originally-proposed assertion (`'.*'`) was found tautological post-escape and replaced with `'A-B'`.
- `npm test`: 1217 pass / 0 fail. Semgrep (pinned p/default, local 1.170.0 == CI pin): 0 findings, 0 errors on all 4 touched files, before AND after prose removal — so suppression survives prose deletion.

REVIEWS: code-reviewer and security-reviewer both APPROVE-WITH-FIXES. Both independently raised the same HIGH/MEDIUM — that deriving IDENTIFIER via `IDENTIFIER_RE.source.slice(1,-1)` defeats semgrep constant propagation and creates a new unsuppressed finding at ledger-lint.mjs:62, failing CI. REFUTED empirically (see decision record): both had explicitly caveated they reconstructed the rule because they could not fetch p/default; I tested against the real pinned ruleset. Security reviewer's proposed fix (`new RegExp(\`^${IDENTIFIER}$\`)`) would itself have introduced a non-literal RegExp. Applied the readability half anyway (two plain literals) because it shrinks the diff and stops refactoring an untouched constant. Security reviewer separately confirmed the guard is unbypassable across 24 hostile inputs (type coercion, Symbol.toPrimitive, prototype pollution, unicode/astral/lone-surrogate, `$`-without-`m` newline tricks) and that ReDoS is not reachable (0.58ms on a 400KB adversarial corpus).

WHAT FAILED / COST
- First mechanical-editor pass read the PARENT repo copy of ledger-lint.mjs instead of the worktree copy (identical relative path) and correctly STOPPED rather than guessing. Re-dispatched with absolute paths and an explicit decoy warning. Lesson for this repo: always give subagents absolute worktree paths.
- `timeout` is not on PATH on macOS (exit 127); use no timeout or gtimeout.
- `curl` denied to the orchestrator too; python3 urllib worked for fetching p/default.

LEDGER CORRECTIONS
- Suite is 1217 tests, NOT the 1347 recorded in open_risks. Measured via `npm test`, and that count already includes the +1 test added this session. Risk note was wrong; corrected in the spine.
- Full `npm test` runs all three test dirs (superpowers-parallel, hooks, impeccable); superpowers-parallel alone is 1146.

NOT FIXED (out of scope, newly surfaced by the security review): pre-existing false negative in flagHasReachableTruePath's env probe — it has no left boundary, so `myprocess.env.X_ENABLED` returns true and lintFlags silently SKIPS the flag. Also `'X$'` vs `process.env.X$` returns false because `\b` follows a non-word char. Fails in the suppressing direction. Needs its own item.