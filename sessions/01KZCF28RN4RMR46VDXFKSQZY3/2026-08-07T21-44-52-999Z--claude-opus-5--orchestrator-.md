CORRECTION to the previous entry, which recorded CI as red and the portability fix round as dispatched-but-unread. The round landed and CI is GREEN. PR #54 is OPEN and CLEAN (mergeable). Nothing is left running at hand-off.

Pushed sha f14fb9dcc29aec0f9c8756dad109c72244b551ec. Verified independently rather than on the agent's report:
- test workflow on f14fb9d: success in BOTH modes (run 31221011614 pull_request, run 31221008194 push). The red runs 31219569440 / 31218786203 were on the previous sha 58a5085.
- security workflow success (sca, secret-scan, sast); labeler success.
- gh pr view 54 -> OPEN CLEAN.
- git diff 58a5085..HEAD -- scripts/config/validate.mjs is EMPTY. The fix was entirely in tests; production behavior is byte-identical, which was the hard requirement.
- Runner totals: 2046 tests, 2044 pass, 0 fail, 2 skipped. Local: 2045 pass, 1 fail, still only the environment-dependent protect-claude-config.test.mjs:194.

WHAT THE SWEEP FOUND BEYOND THE CI FAILURE, and it is the more valuable half: four more tests carried the same hidden host dependency, and TWO OF THEM PASSED WITH python3 ENTIRELY ABSENT. A missing interpreter raises the same hook-syntax rule those tests asserted, so they were green while proving nothing — the vacuous-pass failure mode, in the suite rather than in the validator. Demonstrated by running the pre-fix files under a python-less PATH: two passed, only one was honest enough to fail.

Tests are now split by intent. Category A asserts checker SELECTION through resolveChecker with zero spawns (hook-language.test.mjs:126, :137, :142); two of these were made STRONGER in passing, moved onto a .mjs and an extensionless file so extension fallback can no longer supply the right answer for the wrong reason. Category B keeps the genuine syntax-rejection tests that need a real interpreter, guarded on availability with a visible skip reason (hook-language.test.mjs:146, validate.test.mjs:168 and :184, diagnostics.test.mjs:30, checker-containment.test.mjs:19), and the three formerly-vacuous ones now also assert the detail names the language so they fail loudly even if a guard were bypassed. New helper scripts/config/tests/_interpreters.mjs probes with the validator's own checkerEnvironment and THROWS on an unknown interpreter name rather than silently skipping on a typo.

Verified the way that actually matters — PATH-stripped, not local green: normal PATH 98 pass / 0 skip (so the end-to-end tests really do run per language when the interpreter is present), no-zsh 97 pass / 1 skip, no-python 94 pass / 4 skip, 0 fail in every case. Mutation probe: emptying ZSH_EXTENSIONS under the zsh-less PATH turns the new selection test red, which the old end-to-end form could never have done on such a machine.

bash and sh end-to-end tests were deliberately left unguarded and reported rather than silently changed: GitHub Actions runs every step through bash, so npm test cannot start without it, and guarding bash would put a skip in front of most of the suite for a non-risk.

Coverage record updated again: M5 requires re-derived citations and six had shifted; B1's path count understated the diff by one because the new helper was untracked when the row was written (post-commit: 16 paths, 11 under tests/); red-first evidence recorded in M3, test-only scope in M4, the new mutation probe in B4.

STATE AT HAND-OFF: PR #54 green, clean, unmerged (merge is human-gated). No cutover step attempted. Local main still stale at 0451220. Nothing runs in the background.