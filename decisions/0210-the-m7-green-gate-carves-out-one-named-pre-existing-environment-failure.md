---
Status: accepted
Date: 2026-08-02T22:38:24.524Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0210. The green gate carves out one named pre-existing environment failure, and never restates the suite as green

## Context

The M7 receipts agent returned verdict red under the mechanical rule "green only if npm test has 0 failures". Exactly one test fails: .claude/hooks/tests/protect-claude-config.test.mjs:194, which asserts ~/.claude/settings.json is a symlink resolving out of the home tree. On this machine it is a regular 9.8KB file, so the assertion fails. The receipts agent proved pre-existence by measurement rather than argument: it ran that same file from the MAIN worktree at a618338 with .claude/hooks/ unmodified and got an identical failure, and M7's nine-file diff touches zero files under .claude/hooks/. CI provisions ~/.claude differently and skips it, which is the "1 skipped" in the stated main CI baseline of 1832/1831/0 fail/1 skipped. Left as a mechanical red, this would have halted the ship on a defect that does not exist in the branch; accepted silently, it would have let a real regression hide behind the carve-out.

## Options

- Keep the mechanical zero-failure rule and halt the ship - blocks on an environment fact the branch cannot fix
- Fix the machine's ~/.claude symlink topology first - real, but unrelated to M7 and outside its scope
- Define an operative green test that names the single excluded test, so any OTHER failure still halts

## Outcome

Operative green test adopted: the branch is green when npm test has zero failures OTHER THAN protect-claude-config.test.mjs, AND phase-parity passes, AND mirror-guard passes. Any other failing test is a genuine red and halts. Paired with a wording rule that proved load-bearing: nothing in the PR body, the coverage artifact or any report may restate this as "the suite is green" - it is stated as one pre-existing environment-only failure, named, with its proof. The ship agent honored it, carrying "the suite is not fully green - protect-claude-config.test.mjs:194 fails; pre-existing at a618338 and untouched by this diff" as a --not-verified line. The underlying environment defect is UNFIXED and is a real exposure: the guard's own error text says it discovers no repository base and stops protecting the checkout, so that protection is currently inert on this machine.
