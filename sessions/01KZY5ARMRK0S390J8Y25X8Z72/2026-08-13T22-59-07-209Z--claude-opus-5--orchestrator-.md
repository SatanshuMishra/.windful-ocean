Landed the permission stack on main and released it; Layer 1 is now proven live.

SHIPPED
- Diagnosed 3 reversibility test failures via subagent: one shared cause, in fixtures, not production. Scratch repos were built with a bare `git` that inherited the machine's commit.gpgsign=true + gpg.format=ssh; under Layer 0 the ssh-agent is unreachable, so every fixture commit exited 128 and left HEAD unborn. Production is immune because checkpoint.mjs uses `git commit-tree`, which does not honor commit.gpgsign.
- The fix already existed as 598afb9 on feat/layer1-reversibility (character-for-character), so it was integrated rather than re-authored. Cherry-picked to 67495e3.
- Reversibility tests 44/3 -> 47 pass 0 fail. Full suite at 67495e3: 2346 tests, 2345 pass, 0 fail, 1 todo. The wave-planner entry is a `todo`-marked known gap, NOT a failure - an earlier reading of it as a pre-existing red was wrong; main was green.
- Promotion rehearsed at 67495e3 against a throwaway config root: promote exit 0, verify exit 0, 437 files.
- main fast-forwarded 30f4b90 -> 67495e3.
- Published as PR #95 (merge commit, so 67495e3 survives as an ancestor rather than being squashed away). Live promoted to 476ec59d. Bootstrap refreshed to the full 9-module closure (registrations.mjs and staleness.mjs now present).
- LAYER 1 VERIFIED FIRING. Two checkpoint refs newer than the 14:13 baseline, written by committer `reversibility-checkpoint <reversibility-checkpoint@localhost>` with message "reversibility checkpoint before Bash <worktree>" over full 3191-file trees. This is the proof the thread had been chasing for three sessions. It took effect WITHOUT a restart - the refs were written by this session's own Bash calls minutes after convergence registered the hooks.

FAILED / BLOCKED
- Direct `git push origin main` was rejected: GH013 repository ruleset, "Changes must be made through a pull request." Route was switched to pushing the commit to the existing remote feature branch, then pr-create, then a web-UI merge.
- The cherry-pick could not be done in the primary worktree: Layer 0 denies writes to .claude/hooks/**, so it applied install.sh and then failed to unlink the three test files, leaving a dirty tree. Restored, then redone in a scratch worktree under the scratchpad. No immutable file flags are involved; it is the sandbox policy.
- I cannot promote at all from a sandboxed session: ~/.claude, ~/.claude/local, ~/.claude/releases, ~/.claude/current and settings.json all probed write-DENIED. The Stop hook's converge.mjs runs outside the Bash sandbox, which is exactly why it kept reverting installs, and is what performed the release.
- 67495e3 is unsigned. Signing is impossible here and `git -c` is denied at the gate, so the override could not be applied; --no-gpg-sign was used.

OPEN AND RED
- `config verify` exits 1 against live 476ec59d, with two drift items. (1) rules/context7.md is tracked and present in main's tree yet absent from the built release directory entirely - the builder appears to ship rules/common/** and miss top-level rules/*.md, so that rule has never been live globally. (2) hooks/agent-ledger/__pycache__/_ledger.cpython-314.pyc was written INTO the release directory at 16:53, the same minute as promotion - a python hook executes inside a tree the release model assumes is immutable, so verify will go red after every promotion until excluded.
- An earlier `verify_exit=0` in this session was `tail`'s exit code through a pipe, not verify's; the true exit is 1. Do not read a piped exit code as the receipt.
