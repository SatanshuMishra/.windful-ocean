CORRECTION to the previous entry, which recorded PR #54's CI conclusion as unknown. The watch (shell b6gk6b9xi) completed during hand-off and was read. It is no longer running; nothing needs killing.

CI RUN 31219569440 ON PR #54: FAILURE. invariant-coverage passed; the test job failed.

Cause, and it is OURS, not the pre-existing local failure:

  test at scripts/config/tests/hook-language.test.mjs:170:1
  x a .zsh hook with no shebang is checked as zsh rather than left unchecked
    detail: "$HOME/.claude/hooks/prompt.zsh: zsh could not be run: spawnSync zsh ENOENT"
    actual: 'rejected'  expected: 'promoted'

zsh is not installed on the GitHub Ubuntu runner, so the .zsh hook dispatches to zsh -n, ENOENTs, and the release is rejected. CI totals 2045 tests, 2043 pass, 1 fail, 1 skipped.

Two facts worth carrying:
- The local-only failure (protect-claude-config.test.mjs:194) does NOT occur on CI, because there is no ~/.claude there. So local red and CI red are DIFFERENT failures, and "one failure locally" was never evidence CI would be green. Do not conflate them again.
- The production behavior is correct and must not be changed to make CI green. Hooks run on the machine that validates them, so a missing interpreter means the hook genuinely cannot run, and rejecting is the fail-closed posture this branch adopted deliberately (see the fail-closed decision recorded this session). The defect is the TEST, which asserts an end-to-end promotion that silently depends on the host's installed interpreters.

This is the portability class the first code review raised as LOW against python3 (validate.test.mjs:177 at the time) and that I dismissed as "no action". That dismissal was wrong: the same class then bit us on zsh, which is less universally present than the interpreter the review actually named. The lesson is not "add zsh to CI" but that any test spawning a real interpreter carries a hidden host dependency and must either assert checker SELECTION without spawning, or guard on availability with a visible skip reason.

A fix round was dispatched before hand-off (agent a4bd45bc18956cae9) to reclassify every interpreter-spawning test in scripts/config/tests/ into selection-asserting or availability-guarded, keeping at least one real end-to-end spawn per language, and to verify the fix by re-running with zsh and python3 stripped from PATH rather than by trusting a local green. Its result was NOT read before hand-off. VERIFY THE PUSHED SHA AND THE CI CONCLUSION BEFORE MERGING; do not assume that round landed or worked.

PR #54 body claims `npm test - 2044 of 2045 pass`. That was a true statement about the LOCAL run at the time it was written, and PR bodies are never rewritten after creation in this environment, so it stands as-is; this ledger entry is the correction of record.