---
Status: accepted
Date: 2026-08-08T03:23:08.256Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0287. settings.json stays a real live file and the guard's probe test is what changes

## Context

0286 adopted the cutover unit but explicitly left one question for the unit to resolve: whether settings.json ends up a promoted symlink or a real live file, given the conflict between the guard's test and 0270. Measured this session. On one side, .claude/hooks/tests/protect-claude-config.test.mjs:16 puts settings.json in PROBE_FILES alongside CLAUDE.md and keybindings.json, and the test at :194 asserts every probe realpaths OUT of the home tree under its own name - that is, must be a symlink. On the other side, three independent sources require the opposite: 0270 excludes settings.json from releases entirely and reconciles it by ownership manifest because Claude Code writes the file itself; SPEC section 6 and the layout table mark it REAL file, never promoted; and scripts/config/release.mjs:5-13 stripSettings removes it from every candidate before any swap, with promote.mjs refusing the swap outright if the strip fails. Live ~/.claude/settings.json is already a real file today, so the probe test is passing now only because the guard skips absent or non-symlinked probes rather than because the two views agree. The conflict is one-sided: the test is the only artifact asserting the symlink form, and it asserts it as a side effect of sharing a probe list with two files that genuinely are symlinks.

## Options

- Drop settings.json from PROBE_FILES and assert its real-file status in its own test - ADOPTED
- Make settings.json a promoted symlink so the existing test passes unchanged. Refuted by measurement in 0270: a symlinked settings.json is written through, so a live write would mutate the release in place and break immutability, and any setting written under one release would be stranded when the pointer swapped
- Leave the conflict unresolved and let the test fail after cutover. Rejected: a red guard test immediately after a live cutover is indistinguishable from a real guard regression, at exactly the moment the guard matters most
- Delete the assertion entirely rather than re-homing it. Rejected: the probe mechanism is how the guard finds the checkout, and CLAUDE.md and keybindings.json still must resolve out of the home tree

## Outcome

Adopted. settings.json is a real live file, never a symlink, never inside a release. PROBE_FILES narrows to CLAUDE.md and keybindings.json, and settings.json gets its own assertion that it is a real file rather than a link.

This closes the question 0286 deferred, and it closes it against the test rather than against the design - the design position is held by three artifacts and a prior measurement, the symlink position by one shared list.

Two things this forces inside the unit. The narrowed PROBE_FILES is also the guard's repo-root discovery input, so narrowing it shrinks the set of paths the guard can realpath to find the checkout - which is acceptable only because the same unit repoints discovery at the LIVE receipt's repo_root, per SPEC section 9. The two changes are not independent and must land together. And the new real-file assertion must fail if settings.json ever becomes a symlink again, so a future promotion that accidentally includes it is caught by the guard's own suite rather than in production.
