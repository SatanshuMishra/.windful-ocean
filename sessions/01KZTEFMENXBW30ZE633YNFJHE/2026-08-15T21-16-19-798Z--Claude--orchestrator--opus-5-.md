Re-landed C6 and cut the porting MSP. The base moved f252fef7 -> 1ac4af96 and is green.

SHIPPED
- PR #124, C6 re-land. Fresh PR from feat/c6-boundary-program (82a8d2fe) onto feat/mitosis-os-process, replaying exactly 20 commits, 11 files, +3737/-0. Proven safe before opening: git merge-tree gave tree 1474c3b4, byte-identical to C6's own tree, so the C6 worktree WAS the post-merge state. Local: 3177 tests, 3176 pass, 0 fail, 1 todo; all four gate verbs exit 0. CI 13/13. Merged by the user. Content-verified on the base: all seven boundary modules and all four boundary test suites present. Base re-run after merge: 3176 pass, 0 fail, 4/4 verbs green.
- PR #125, the porting MSP scope doc, .claude/docs/specs/2026-08-15-mitosis-porting-msp-scope.md. 13/13 CI, merged, content-verified.
- PR #126, closing Q2 in that doc. 13/13 CI, merged, content-verified on the base at 1ac4af96.
- Branch cleanup, user-confirmed: feat/c5b-coupling-parity and feat/c6-boundary-program worktrees removed, local and remote branches deleted, all refs confirmed gone locally, remotely and in tracking. The condition that made #122 merge into a dead branch is closed.
- Decisions 0447 and 0448 recorded.

THE FINDING THAT COST THE MOST
Cutting the porting MSP needed C7's obligation list. Three of the five arrays carrying it no longer exist in the tree: 2087dd51 deleted PROMPT_C7_OBLIGATIONS and TRANSCRIPTION_C7_OBLIGATIONS, and 82a8d2fe, C6's own tip, deleted BOUNDARY_C7_OBLIGATIONS. Their host modules were census apparatus retired under 0439. Seventeen of the twenty-six obligations went with them as collateral and none was discharged. They were recovered verbatim from 3bbd8fb4 and f0ab1c24 into the scope doc, so the list no longer depends on a reader knowing which commit to resurrect. JOURNAL_C7_OBLIGATIONS (journal-store.mjs:21-29) and COUPLING_OBLIGATIONS (coupling-review.mjs:35-42) remain live.

WHAT DID NOT GO CLEANLY
- The first suite run reported exit 0 that was actually tail's exit code through a pipe, while an assertion error sat in the captured tail. Re-run without the pipe gave the true status. A piped npm test cannot be read as a green.
- mcp reconcile failed again all session with spawn git ENOENT, so branch and binding drift was never folded.
- Q1 is unanswerable from any surviving artifact: 0424 records that two of the seven prompt obligations were deferred security HIGHs, but nothing tags which two. R3 and R5 are the grounded guess, both command-injection; recorded as inference, not as a finding.

STATE FOR THE NEXT SESSION
Base feat/mitosis-os-process @ 1ac4af96, green, no open PRs. On the base: A-series, B3, C1, C2, C3, C4, C4b, C4c, C5a, C5b, C6, plus the porting MSP scope. Remaining: CP (the porting MSP), C7, D1, D2, D3. Nothing merged to main, per c3.